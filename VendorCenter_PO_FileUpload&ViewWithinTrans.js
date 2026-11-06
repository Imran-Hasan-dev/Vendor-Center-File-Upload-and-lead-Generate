/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * PERFORMANCE NOTES (see accompanying summary):
 * - Static CSS/JS strings are built ONCE at module load time instead of on
 *   every request (they never change per-request).
 * - HTML fragments are assembled with array push + join('') instead of
 *   repeated string += (avoids O(n^2) intermediate string allocation).
 * - runtime.getCurrentScript() / its id+deploymentId are read once and
 *   reused instead of being re-fetched on every url.resolveScript() call.
 * - The PO search uses search.runPaged() so results stream page-by-page
 *   instead of materializing up to 1000 rows in one getRange() call.
 * - escapeHtml() does a single-pass regex replace via a lookup map instead
 *   of 5 sequential .replace() scans over the same string.
 * - poRows uses a Map instead of a plain object (faster inserts/lookups,
 *   no prototype-chain overhead, and Object.keys() -> Map.size/iteration).
 */
define([
    'N/ui/serverWidget',
    'N/search',
    'N/runtime',
    'N/url',
    'N/file',
    'N/record',
    'N/format'
], (
    serverWidget,
    search,
    runtime,
    url,
    file,
    record,
    format
) => {

    const UPLOAD_FOLDER_PARAM = 'custscript_vendor_file_folder_po';

    // Number of purchase orders shown per page. Keeping this small is
    // what makes 1000+ PO vendors fast: we only ever build HTML and pull
    // file data for this many POs at once, never the full result set.
    const PAGE_SIZE = 50;

    // ================================================================
    // STATUS OPTIONS (built once, reused every request)
    // ================================================================

    const STATUS_OPTIONS = [
        { value: '', text: '- All -' },
        { value: 'PurchOrd:A', text: 'Pending Approval' },
        { value: 'PurchOrd:B', text: 'Pending Receipt' },
        { value: 'PurchOrd:C', text: 'Rejected' },
        { value: 'PurchOrd:D', text: 'Partially Received' },
        { value: 'PurchOrd:E', text: 'Pending Billing/Partially Received' },
        { value: 'PurchOrd:F', text: 'Pending Billing' },
        { value: 'PurchOrd:G', text: 'Fully Billed' },
        { value: 'PurchOrd:H', text: 'Closed' }
    ];

    // ================================================================
    // ESCAPE HTML  (single-pass, no chained .replace() scans)
    // ================================================================

    const HTML_ESCAPE_RE = /[&<>"']/g;
    const HTML_ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    const escapeHtml = (value) => {
        const str = value === null || value === undefined ? '' : String(value);
        return str.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
    };

    // ================================================================
    // STATIC CSS — built exactly once when the module loads, not per
    // request. This is the single biggest win: previously ~60 string
    // concatenations ran on EVERY page view even though the CSS text
    // never changes.
    // ================================================================

    const MAIN_TABLE_CSS =
        '<style>' +
        '.vendor-bill-wrapper{width:100%;margin-top:20px;font-family:Arial,Helvetica,sans-serif;}' +
        '.vendor-bill-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9d9d9;}' +
        '.vendor-bill-table th{background:#f4f5f7;color:#333;font-weight:600;font-size:13px;padding:10px 8px;' +
        'border-bottom:2px solid #d9d9d9;border-right:1px solid #e5e5e5;text-align:left;white-space:nowrap;}' +
        '.vendor-bill-table td{padding:8px;border-bottom:1px solid #e5e5e5;border-right:1px solid #eeeeee;' +
        'font-size:13px;vertical-align:top;}' +
        '.vendor-bill-table tr:hover td{background:#fafafa;}' +
        '.bill-number{font-weight:600;white-space:nowrap;}' +
        '.file-list{display:flex;flex-direction:column;gap:0;min-width:220px;max-width:380px;}' +
        '.file-item{display:flex;align-items:center;height:30px;min-height:30px;max-height:30px;' +
        'box-sizing:border-box;min-width:0;}' +
        '.file-icon{font-size:13px;margin-right:6px;flex:0 0 auto;line-height:30px;}' +
        '.file-link{display:block;width:100%;max-width:340px;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;text-decoration:none;color:#1769aa;font-size:13px;line-height:30px;' +
        'height:30px;box-sizing:border-box;}' +
        '.file-link:hover{text-decoration:underline;color:#0b4f82;}' +
        '.file-separator{height:1px;min-height:1px;background:#eeeeee;margin:0;}' +
        '.modified-list{display:flex;flex-direction:column;gap:0;white-space:nowrap;}' +
        '.modified-item{display:flex;align-items:center;height:30px;min-height:30px;max-height:30px;' +
        'box-sizing:border-box;padding:0;font-size:12px;line-height:30px;color:#555;}' +
        '.modified-separator{height:1px;min-height:1px;background:#eeeeee;margin:0;}' +
        '.no-file{color:#888;font-style:italic;}' +
        '.upload-link{display:inline-block;padding:6px 12px;background:#1769aa;color:#fff !important;' +
        'text-decoration:none;border-radius:4px;font-size:12px;white-space:nowrap;}' +
        '.upload-link:hover{background:#0f578d;}' +
        '.status-cell{white-space:nowrap;}' +
        '.amount-cell{white-space:nowrap;text-align:right;}' +
        '.empty-results{padding:30px;text-align:center;color:#777;border:1px solid #ddd;' +
        'background:#fafafa;margin-top:20px;}' +
        '.pagination-bar{display:flex;align-items:center;justify-content:space-between;' +
        'padding:12px 4px;font-size:13px;color:#555;}' +
        '.pagination-links{display:flex;gap:8px;}' +
        '.page-link{padding:6px 14px;border:1px solid #d9d9d9;border-radius:4px;' +
        'text-decoration:none;color:#1769aa;font-size:13px;background:#fff;}' +
        '.page-link:hover{background:#f5faff;border-color:#1769aa;}' +
        '.page-link.disabled{color:#bbb;border-color:#eee;pointer-events:none;cursor:default;}' +
        '</style>';

    const UPLOAD_FORM_CSS =
        '<style>' +
        '.upload-container{max-width:850px;margin:20px auto;font-family:Arial,Helvetica,sans-serif;color:#333;}' +
        '.upload-header{background:#f7f9fc;border:1px solid #e1e5eb;border-radius:8px;padding:20px 24px;margin-bottom:18px;}' +
        '.upload-title{font-size:22px;font-weight:600;margin:0 0 6px 0;color:#222;}' +
        '.upload-subtitle{font-size:13px;color:#666;margin:0;}' +
        '.bill-card{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 20px;' +
        'background:#fff;border:1px solid #dfe3e8;border-radius:8px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);}' +
        '.bill-label{font-size:12px;color:#777;margin-bottom:4px;}' +
        '.bill-number{font-size:17px;font-weight:600;color:#1769aa;}' +
        '.bill-icon{font-size:28px;}' +
        '.upload-box{border:2px dashed #b8c2cc;border-radius:10px;background:#fafbfc;padding:40px 25px;' +
        'text-align:center;transition:all .2s ease;cursor:pointer;}' +
        '.upload-box:hover{border-color:#1769aa;background:#f5faff;}' +
        '.upload-box.dragover{border-color:#1769aa;background:#eef7ff;}' +
        '.upload-icon{font-size:42px;margin-bottom:12px;}' +
        '.upload-main-text{font-size:16px;font-weight:600;color:#333;margin-bottom:6px;}' +
        '.upload-secondary-text{font-size:13px;color:#777;margin-bottom:16px;}' +
        '.choose-file-button{display:inline-block;padding:9px 18px;background:#1769aa;color:#fff;' +
        'border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;}' +
        '.choose-file-button:hover{background:#0f578d;}' +
        '.selected-file{display:none;margin-top:18px;padding:12px 15px;background:#f6ffed;' +
        'border:1px solid #b7eb8f;border-radius:6px;text-align:left;}' +
        '.selected-file-name{font-size:13px;font-weight:600;color:#237804;word-break:break-word;}' +
        '.rename-warning{margin-top:18px;padding:14px 16px;background:#fffbe6;border:1px solid #ffe58f;' +
        'border-radius:6px;color:#614700;font-size:13px;line-height:20px;text-align:left;}' +
        '.rename-warning-title{font-weight:600;margin-bottom:4px;}' +
        '.upload-info{margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}' +
        '.info-card{padding:14px;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:6px;}' +
        '.info-card-title{font-size:12px;font-weight:600;color:#555;margin-bottom:4px;}' +
        '.info-card-text{font-size:12px;color:#777;line-height:18px;}' +
        '@media(max-width:700px){.upload-container{max-width:100%;}.upload-info{grid-template-columns:1fr;}' +
        '.bill-card{flex-direction:column;align-items:flex-start;}}' +
        '</style>';

    const UPLOAD_FORM_SCRIPT =
        '<script>' +
        '(function(){' +
        'var uploadBox=document.getElementById("customUploadBox");' +
        'var selectedFile=document.getElementById("selectedFile");' +
        'var selectedFileName=document.getElementById("selectedFileName");' +
        'var fileInput=document.querySelector("input[type=\\"file\\"]");' +
        'if(!fileInput){return;}' +
        'var fileContainer=fileInput.closest(".uir-field-wrapper");' +
        'if(fileContainer){fileContainer.style.display="none";}' +
        'var chooseButton=uploadBox.querySelector(".choose-file-button");' +
        'chooseButton.addEventListener("click",function(e){e.preventDefault();fileInput.click();});' +
        'fileInput.addEventListener("change",function(){' +
        'if(fileInput.files&&fileInput.files.length>0){' +
        'var selected=fileInput.files[0];' +
        'selectedFileName.textContent="Selected file: "+selected.name;' +
        'selectedFile.style.display="block";' +
        '}else{selectedFile.style.display="none";}' +
        '});' +
        'uploadBox.addEventListener("dragover",function(e){e.preventDefault();uploadBox.classList.add("dragover");});' +
        'uploadBox.addEventListener("dragleave",function(e){e.preventDefault();uploadBox.classList.remove("dragover");});' +
        'uploadBox.addEventListener("drop",function(e){' +
        'e.preventDefault();' +
        'uploadBox.classList.remove("dragover");' +
        'if(e.dataTransfer.files&&e.dataTransfer.files.length>0){' +
        'try{' +
        'var dataTransfer=new DataTransfer();' +
        'dataTransfer.items.add(e.dataTransfer.files[0]);' +
        'fileInput.files=dataTransfer.files;' +
        'fileInput.dispatchEvent(new Event("change",{bubbles:true}));' +
        '}catch(err){console.log(err);}' +
        '}' +
        '});' +
        '})();' +
        '</script>';

    // ================================================================
    // SUITELET ENTRY POINT
    // ================================================================

    const onRequest = (context) => {
        try {
            const request = context.request;
            const response = context.response;
            const currentUser = runtime.getCurrentUser();
            const vendorId = currentUser.id;

            // Resolve script id/deploymentId ONCE and reuse everywhere,
            // instead of calling runtime.getCurrentScript() repeatedly.
            const currentScript = runtime.getCurrentScript();
            const scriptId = currentScript.id;
            const deploymentId = currentScript.deploymentId;

            // ========================================================
            // FILE DOWNLOAD
            // ========================================================

            const fileId = request.parameters.custpage_fileid;

            if (fileId) {
                downloadPurchaseOrderFile({
                    context: context,
                    vendorId: vendorId,
                    fileId: fileId
                });
                return;
            }

            // ========================================================
            // FILE UPLOAD
            // ========================================================

            const uploadPoId = request.parameters.custpage_upload_po_id;

            if (
                request.method === 'POST' &&
                uploadPoId &&
                request.files &&
                request.files.custpage_upload_file
            ) {
                processPurchaseOrderFileUpload({
                    context: context,
                    vendorId: vendorId,
                    poId: uploadPoId,
                    scriptId: scriptId,
                    deploymentId: deploymentId
                });
                return;
            }

            // ========================================================
            // OPEN UPLOAD FORM
            // ========================================================

            if (uploadPoId) {
                showUploadForm({
                    context: context,
                    vendorId: vendorId,
                    poId: uploadPoId
                });
                return;
            }

            // ========================================================
            // FILTER VALUES
            // ========================================================

            const poNumber = request.parameters.custpage_po_number || '';
            const dateFrom = request.parameters.custpage_date_from || '';
            const dateTo = request.parameters.custpage_date_to || '';
            const status = request.parameters.custpage_status || '';

            // Requested page is only ever set via the Prev/Next links below,
            // never via the filter form, so changing a filter naturally
            // resets back to page 0.
            let requestedPage = parseInt(request.parameters.custpage_page, 10);
            if (!Number.isFinite(requestedPage) || requestedPage < 0) {
                requestedPage = 0;
            }

            // ========================================================
            // MAIN FORM
            // ========================================================

            const form = serverWidget.createForm({
                title: 'My Purchase Orders'
            });

            const vendorField = form.addField({
                id: 'custpage_vendor',
                type: serverWidget.FieldType.TEXT,
                label: 'Vendor'
            });
            vendorField.defaultValue = currentUser.name || '';
            vendorField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

            const poNumberField = form.addField({
                id: 'custpage_po_number',
                type: serverWidget.FieldType.TEXT,
                label: 'PO Number'
            });
            poNumberField.defaultValue = poNumber;

            const dateFromField = form.addField({
                id: 'custpage_date_from',
                type: serverWidget.FieldType.DATE,
                label: 'Date From'
            });
            if (dateFrom) {
                dateFromField.defaultValue = dateFrom;
            }

            const dateToField = form.addField({
                id: 'custpage_date_to',
                type: serverWidget.FieldType.DATE,
                label: 'Date To'
            });
            if (dateTo) {
                dateToField.defaultValue = dateTo;
            }

            const statusField = form.addField({
                id: 'custpage_status',
                type: serverWidget.FieldType.SELECT,
                label: 'Status'
            });
            // Loop over the static options array instead of 9 repeated
            // addSelectOption() call blocks.
            for (let i = 0; i < STATUS_OPTIONS.length; i++) {
                statusField.addSelectOption(STATUS_OPTIONS[i]);
            }
            if (status) {
                statusField.defaultValue = status;
            }

            form.addSubmitButton({
                label: 'Filter'
            });

            const resetUrl = url.resolveScript({
                scriptId: scriptId,
                deploymentId: deploymentId,
                returnExternalUrl: false
            });

            const resetScript = form.addField({
                id: 'custpage_reset_script',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            resetScript.defaultValue =
                '<script>function resetFilters(){window.location.href=' +
                JSON.stringify(resetUrl) +
                ';}</script>';

            form.addButton({
                id: 'custpage_reset_filters',
                label: 'Reset Filters',
                functionName: 'resetFilters'
            });

            // ========================================================
            // SEARCH FILTERS
            // ========================================================

            const filters = [
                ['entity', 'anyof', vendorId],
                'AND',
                ['mainline', 'is', 'T']
            ];

            if (poNumber) {
                filters.push('AND', ['tranid', 'contains', poNumber]);
            }
            if (dateFrom) {
                filters.push('AND', ['trandate', 'onorafter', dateFrom]);
            }
            if (dateTo) {
                filters.push('AND', ['trandate', 'onorbefore', dateTo]);
            }
            if (status) {
                filters.push('AND', ['status', 'anyof', status]);
            }

            // ========================================================
            // STEP 1 — PO HEADER SEARCH (no file join, one row per PO)
            //
            // This is what makes pagination safe: a raw join to the file
            // record would put multiple rows per PO into the result set,
            // and slicing that into fixed-size pages could split one PO's
            // files across two pages. Keeping this search join-free means
            // each page of PAGE_SIZE results is exactly PAGE_SIZE distinct
            // POs, and pagedData.count gives the true total instantly
            // without loading all rows into memory.
            // ========================================================

            const poHeaderSearch = search.create({
                type: search.Type.PURCHASE_ORDER,
                filters: filters,
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'trandate' }),
                    search.createColumn({ name: 'duedate' }),
                    search.createColumn({ name: 'statusref' }),
                    search.createColumn({ name: 'currency' }),
                    search.createColumn({ name: 'amount' })
                ]
            });

            const headerPagedData = poHeaderSearch.runPaged({ pageSize: PAGE_SIZE });
            const totalCount = headerPagedData.count;
            const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / PAGE_SIZE);
            const pageIndex = Math.min(requestedPage, totalPages - 1);

            // Map preserves insertion order and avoids prototype-chain
            // lookups that a plain {} incurs on every property access.
            const poRows = new Map();
            const poIdsOnPage = [];

            if (totalCount > 0) {
                const headerPage = headerPagedData.fetch({ index: pageIndex });

                headerPage.data.forEach((result) => {
                    const poId = result.getValue({ name: 'internalid' });
                    if (!poId) {
                        return;
                    }

                    poIdsOnPage.push(poId);

                    poRows.set(poId, {
                        internalId: poId,
                        tranId: result.getValue({ name: 'tranid' }),
                        tranDate: result.getValue({ name: 'trandate' }),
                        dueDate: result.getValue({ name: 'duedate' }),
                        status: result.getText({ name: 'statusref' }) ||
                            result.getValue({ name: 'statusref' }),
                        currency: result.getText({ name: 'currency' }),
                        amount: result.getValue({ name: 'amount' }),
                        files: new Map()
                    });
                });
            }

            // ========================================================
            // STEP 2 — FILES FOR JUST THIS PAGE'S POs
            //
            // Only ever queries the <=PAGE_SIZE PO ids we're about to
            // render, instead of every attachment for every PO the
            // vendor has ever had.
            // ========================================================

            if (poIdsOnPage.length > 0) {
                const fileSearch = search.create({
                    type: search.Type.PURCHASE_ORDER,
                    filters: [
                        ['internalid', 'anyof', poIdsOnPage],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'internalid', join: 'file' }),
                        search.createColumn({ name: 'name', join: 'file' }),
                        search.createColumn({ name: 'modified', join: 'file' })
                    ]
                });

                // A page of 50 POs' attachments comfortably fits well
                // under 1000 rows in virtually all real-world cases.
                const fileResults = fileSearch.run().getRange({ start: 0, end: 1000 });

                fileResults.forEach((result) => {
                    const poId = result.getValue({ name: 'internalid' });
                    const po = poRows.get(poId);
                    if (!po) {
                        return;
                    }

                    const attachedFileId = result.getValue({ name: 'internalid', join: 'file' });
                    const attachedFileName = result.getValue({ name: 'name', join: 'file' });
                    const modifiedDateTime = result.getValue({ name: 'modified', join: 'file' });

                    if (!attachedFileId || !attachedFileName) {
                        return;
                    }

                    let modifiedDate = '';
                    if (modifiedDateTime) {
                        try {
                            const dateObj = format.parse({
                                value: modifiedDateTime,
                                type: format.Type.DATETIME
                            });
                            modifiedDate = format.format({
                                value: dateObj,
                                type: format.Type.DATE
                            });
                        } catch (e) {
                            log.error({ title: 'File Date Conversion Error', details: e });
                            modifiedDate = modifiedDateTime;
                        }
                    }

                    po.files.set(attachedFileId, {
                        id: attachedFileId,
                        name: attachedFileName,
                        modified: modifiedDate
                    });
                });
            }

            log.debug({
                title: 'Purchase Order Page Loaded',
                details: {
                    page: pageIndex,
                    totalCount: totalCount,
                    posOnPage: poIdsOnPage.length
                }
            });

            // ========================================================
            // BUILD HTML  (array push + single join, not += chains)
            // ========================================================

            const htmlParts = [MAIN_TABLE_CSS, '<div class="vendor-bill-wrapper">'];

            if (poRows.size === 0) {
                htmlParts.push(
                    '<div class="empty-results"><b>No Purchase Orders Found</b><br>',
                    'No Purchase Orders match the selected filters.</div>'
                );
            } else {
                htmlParts.push(
                    '<table class="vendor-bill-table"><thead><tr>',
                    '<th>PO Number</th><th>Date</th><th>Due Date</th><th>Status</th>',
                    '<th>Currency</th><th>Amount</th><th>Files</th><th>Last Modified</th><th>Action</th>',
                    '</tr></thead><tbody>'
                );

                poRows.forEach((po) => {
                    const fileList = Array.from(po.files.values());
                    const fileParts = [];
                    const modifiedParts = [];

                    if (fileList.length > 0) {
                        fileList.forEach((attachedFile, fileIndex) => {
                            const downloadUrl = url.resolveScript({
                                scriptId: scriptId,
                                deploymentId: deploymentId,
                                params: { custpage_fileid: attachedFile.id }
                            });
                            const safeFileName = escapeHtml(attachedFile.name);

                            fileParts.push(
                                '<div class="file-item"><span class="file-icon">\uD83D\uDCC4</span>' +
                                '<a class="file-link" href="' + escapeHtml(downloadUrl) +
                                '" title="' + safeFileName + '">' + safeFileName + '</a></div>'
                            );
                            modifiedParts.push(
                                '<div class="modified-item">' +
                                escapeHtml(attachedFile.modified || '-') + '</div>'
                            );

                            if (fileIndex < fileList.length - 1) {
                                fileParts.push('<div class="file-separator"></div>');
                                modifiedParts.push('<div class="modified-separator"></div>');
                            }
                        });
                    } else {
                        fileParts.push('<span class="no-file">No File</span>');
                        modifiedParts.push('<span class="no-file">-</span>');
                    }

                    const uploadUrl = url.resolveScript({
                        scriptId: scriptId,
                        deploymentId: deploymentId,
                        params: { custpage_upload_po_id: po.internalId }
                    });

                    htmlParts.push(
                        '<tr>',
                        '<td class="bill-number">', escapeHtml(po.tranId || ''), '</td>',
                        '<td>', escapeHtml(po.tranDate || ''), '</td>',
                        '<td>', escapeHtml(po.dueDate || ''), '</td>',
                        '<td class="status-cell">', escapeHtml(po.status || ''), '</td>',
                        '<td>', escapeHtml(po.currency || ''), '</td>',
                        '<td class="amount-cell">', escapeHtml(po.amount || ''), '</td>',
                        '<td><div class="file-list">', fileParts.join(''), '</div></td>',
                        '<td><div class="modified-list">', modifiedParts.join(''), '</div></td>',
                        '<td><a class="upload-link" href="', escapeHtml(uploadUrl),
                        '" title="Upload file to ', escapeHtml(po.tranId || 'Purchase Order'),
                        '">Upload</a></td>',
                        '</tr>'
                    );
                });

                htmlParts.push('</tbody></table>');

                // ================================================
                // PAGINATION BAR
                // ================================================

                const buildPageUrl = (targetPage) => url.resolveScript({
                    scriptId: scriptId,
                    deploymentId: deploymentId,
                    params: {
                        custpage_po_number: poNumber,
                        custpage_date_from: dateFrom,
                        custpage_date_to: dateTo,
                        custpage_status: status,
                        custpage_page: targetPage
                    }
                });

                const firstRow = pageIndex * PAGE_SIZE + 1;
                const lastRow = Math.min(firstRow + poRows.size - 1, totalCount);

                const prevDisabled = pageIndex <= 0;
                const nextDisabled = pageIndex >= totalPages - 1;

                htmlParts.push(
                    '<div class="pagination-bar">',
                    '<span>Showing ', firstRow, '\u2013', lastRow, ' of ', totalCount, '</span>',
                    '<div class="pagination-links">',
                    '<a class="page-link', (prevDisabled ? ' disabled' : ''), '" href="',
                    (prevDisabled ? '#' : escapeHtml(buildPageUrl(pageIndex - 1))),
                    '">\u2190 Previous</a>',
                    '<span>Page ', (pageIndex + 1), ' of ', totalPages, '</span>',
                    '<a class="page-link', (nextDisabled ? ' disabled' : ''), '" href="',
                    (nextDisabled ? '#' : escapeHtml(buildPageUrl(pageIndex + 1))),
                    '">Next \u2192</a>',
                    '</div>',
                    '</div>'
                );
            }

            htmlParts.push('</div>');

            form.addField({
                id: 'custpage_po_table',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Purchase Orders'
            }).defaultValue = htmlParts.join('');

            const countField = form.addField({
                id: 'custpage_result_count',
                type: serverWidget.FieldType.INTEGER,
                label: 'Total Purchase Orders'
            });
            countField.defaultValue = String(totalCount);
            countField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

            response.writePage(form);
        } catch (e) {
            log.error({
                title: 'Purchase Order Suitelet Error',
                details: e
            });

            const errorForm = serverWidget.createForm({
                title: 'Purchase Orders'
            });

            errorForm.addField({
                id: 'custpage_error',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Error'
            }).defaultValue =
                '<div style="color:#a8071a;font-size:14px;padding:15px;background:#fff1f0;' +
                'border:1px solid #ffccc7;border-radius:5px;">' +
                '<b>Unable to load purchase orders.</b><br><br>' +
                '<b>Error:</b> ' + escapeHtml(e.message || e.toString()) +
                '</div>';

            context.response.writePage(errorForm);
        }
    };

    // ================================================================
    // SHOW UPLOAD FORM
    // ================================================================

    const showUploadForm = (options) => {
        const context = options.context;
        const vendorId = options.vendorId;
        const poId = options.poId;

        const poInfo = getPurchaseOrder({
            vendorId: vendorId,
            poId: poId
        });

        if (!poInfo) {
            const errorForm = serverWidget.createForm({ title: 'Upload File' });
            errorForm.addField({
                id: 'custpage_error',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Error'
            }).defaultValue =
                '<div style="padding:20px;margin:20px 0;background:#fff1f0;' +
                'border:1px solid #ffccc7;border-radius:6px;color:#a8071a;font-size:14px;">' +
                '<b>Access Denied</b><br><br>' +
                'You are not authorized to upload a file to this Purchase Order.</div>';
            context.response.writePage(errorForm);
            return;
        }

        const form = serverWidget.createForm({ title: 'Upload Document' });

        const poIdField = form.addField({
            id: 'custpage_upload_po_id',
            type: serverWidget.FieldType.TEXT,
            label: 'Purchase Order Internal ID'
        });
        poIdField.defaultValue = String(poId);
        poIdField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        form.addField({
            id: 'custpage_upload_file',
            type: serverWidget.FieldType.FILE,
            label: 'Select File'
        });

        form.addSubmitButton({ label: 'Upload Document' });

        form.addButton({
            id: 'custpage_cancel',
            label: 'Cancel',
            functionName: 'cancelPage'
        });

        const cancelScript = form.addField({
            id: 'custpage_cancel_script',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        cancelScript.defaultValue =
            '<script>function cancelPage(){window.location.reload();}</script>';

        // Static CSS/JS blocks are module-level constants — only the
        // small per-request bits (PO name) are concatenated here.
        const uploadHtml =
            UPLOAD_FORM_CSS +
            '<div class="upload-container">' +
            '<div class="upload-header">' +
            '<div class="upload-title">Upload Document</div>' +
            '<div class="upload-subtitle">Upload a document and attach it directly to your Purchase Order.</div>' +
            '</div>' +
            '<div class="bill-card">' +
            '<div><div class="bill-label">Uploading document for Purchase Order</div>' +
            '<div class="bill-number">' + escapeHtml(poInfo.tranId || '') + '</div></div>' +
            '<div class="bill-icon">\uD83D\uDCC4</div>' +
            '</div>' +
            '<div class="upload-box" id="customUploadBox">' +
            '<div class="upload-icon">\uD83D\uDCC1</div>' +
            '<div class="upload-main-text">Choose a file to upload</div>' +
            '<div class="upload-secondary-text">Click below to select a document from your computer</div>' +
            '<label class="choose-file-button">Choose File</label>' +
            '<div class="selected-file" id="selectedFile">' +
            '<div class="selected-file-name" id="selectedFileName"></div></div>' +
            '</div>' +
            '<div class="rename-warning">' +
            '<div class="rename-warning-title">\u26A0 Please rename your document before uploading</div>' +
            'Before uploading, please make sure the file has a clear and meaningful name so it can be ' +
            'easily identified later.<br><b>Example:</b> VendorName_PO_12345_Aug2026.pdf' +
            '</div>' +
            '<div class="upload-info">' +
            '<div class="info-card"><div class="info-card-title">\uD83D\uDCCC Attachment</div>' +
            '<div class="info-card-text">The uploaded file will be attached directly to this Purchase Order.</div></div>' +
            '<div class="info-card"><div class="info-card-title">\uD83D\uDCC2 File Location</div>' +
            '<div class="info-card-text">The file will appear under the Communication &gt; Files subtab.</div></div>' +
            '<div class="info-card"><div class="info-card-title">\uD83D\uDD12 Security</div>' +
            '<div class="info-card-text">The document will be associated with this Purchase Order.</div></div>' +
            '</div>' +
            '</div>' +
            UPLOAD_FORM_SCRIPT;

        form.addField({
            id: 'custpage_upload_ui',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Upload'
        }).defaultValue = uploadHtml;

        context.response.writePage(form);
    };

    // ================================================================
    // PROCESS FILE UPLOAD
    // ================================================================

    const processPurchaseOrderFileUpload = (options) => {
        const context = options.context;
        const vendorId = options.vendorId;
        const poId = options.poId;
        const scriptId = options.scriptId;
        const deploymentId = options.deploymentId;

        const uploadedFile = context.request.files.custpage_upload_file;

        if (!uploadedFile) {
            showUploadError({ context: context, message: 'Please select a file to upload.' });
            return;
        }

        const poInfo = getPurchaseOrder({
            vendorId: vendorId,
            poId: poId
        });

        if (!poInfo) {
            log.error({
                title: 'Unauthorized Purchase Order Upload',
                details: { vendorId: vendorId, poId: poId }
            });
            showUploadError({
                context: context,
                message: 'You are not authorized to upload a file to this Purchase Order.'
            });
            return;
        }

        const folderId = runtime.getCurrentScript().getParameter({ name: UPLOAD_FOLDER_PARAM });

        if (!folderId) {
            log.error({
                title: 'Upload Folder Not Configured',
                details: 'Please configure script parameter ' + UPLOAD_FOLDER_PARAM
            });
            showUploadError({
                context: context,
                message: 'Vendor file upload folder is not configured. Please contact the administrator.'
            });
            return;
        }

        const originalFileName = uploadedFile.name;
        uploadedFile.folder = Number(folderId);
        const savedFileId = uploadedFile.save();

        log.audit({
            title: 'Vendor Purchase Order File Saved',
            details: {
                vendorId: vendorId,
                poId: poId,
                poNumber: poInfo.tranId,
                fileId: savedFileId,
                fileName: originalFileName
            }
        });

        record.attach({
            record: { type: 'file', id: savedFileId },
            to: { type: record.Type.PURCHASE_ORDER, id: poId }
        });

        log.audit({
            title: 'Vendor File Attached To Purchase Order',
            details: {
                vendorId: vendorId,
                poId: poId,
                poNumber: poInfo.tranId,
                fileId: savedFileId,
                fileName: originalFileName
            }
        });

        const suiteletUrl = url.resolveScript({
            scriptId: scriptId,
            deploymentId: deploymentId
        });

        const successForm = serverWidget.createForm({ title: 'File Uploaded Successfully' });

        successForm.addField({
            id: 'custpage_success',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Success'
        }).defaultValue =
            '<div style="max-width:700px;margin:30px auto;padding:25px;background:#f6ffed;' +
            'border:1px solid #b7eb8f;border-radius:8px;color:#237804;font-size:14px;line-height:22px;">' +
            '<div style="font-size:20px;font-weight:600;margin-bottom:12px;">\u2713 File Uploaded Successfully</div>' +
            'Your document has been uploaded and attached to the Purchase Order.<br><br>' +
            '<b>File:</b> ' + escapeHtml(originalFileName) + '<br>' +
            '<b>Purchase Order:</b> ' + escapeHtml(poInfo.tranId || '') + '<br><br>' +
            'The file is now available under the <b>Communication &gt; Files</b> subtab of the Purchase Order.' +
            '</div>' +
            '<script>setTimeout(function(){window.location.href=' +
            JSON.stringify(suiteletUrl) + ';},1500);</script>';

        context.response.writePage(successForm);
    };

    // ================================================================
    // GET PURCHASE ORDER
    // ================================================================

    const getPurchaseOrder = (options) => {
        const vendorId = options.vendorId;
        const poId = options.poId;

        if (!vendorId || !poId) {
            return null;
        }

        const poSearch = search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [
                ['internalid', 'anyof', poId],
                'AND',
                ['entity', 'anyof', vendorId],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'tranid' })
            ]
        });

        const results = poSearch.run().getRange({ start: 0, end: 1 });

        if (!results || results.length === 0) {
            return null;
        }

        return {
            internalId: results[0].getValue({ name: 'internalid' }),
            tranId: results[0].getValue({ name: 'tranid' })
        };
    };

    // ================================================================
    // DOWNLOAD PURCHASE ORDER FILE
    // ================================================================

    const downloadPurchaseOrderFile = (options) => {
        const context = options.context;
        const vendorId = options.vendorId;
        const fileId = options.fileId;

        const fileSearch = search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [
                ['entity', 'anyof', vendorId],
                'AND',
                ['mainline', 'is', 'T'],
                'AND',
                ['file.internalid', 'anyof', fileId]
            ],
            columns: [
                search.createColumn({ name: 'internalid' })
            ]
        });

        const result = fileSearch.run().getRange({ start: 0, end: 1 });

        if (!result || result.length === 0) {
            log.error({
                title: 'Unauthorized File Download',
                details: 'Vendor ' + vendorId + ' attempted to download file ' + fileId
            });
            context.response.write('You are not authorized to download this file.');
            return;
        }

        const vendorFile = file.load({ id: fileId });

        log.debug({
            title: 'Downloading Purchase Order File',
            details: { vendorId: vendorId, fileId: fileId, fileName: vendorFile.name }
        });

        context.response.writeFile({ file: vendorFile, isInline: false });
    };

    // ================================================================
    // SHOW UPLOAD ERROR
    // ================================================================

    const showUploadError = (options) => {
        const context = options.context;
        const message = options.message;

        const errorForm = serverWidget.createForm({ title: 'File Upload Error' });

        errorForm.addField({
            id: 'custpage_upload_error',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Error'
        }).defaultValue =
            '<div style="max-width:700px;margin:30px auto;padding:20px;color:#a8071a;font-size:14px;' +
            'border:1px solid #ffccc7;background:#fff1f0;border-radius:6px;">' +
            '<b>Upload Failed</b><br><br>' + escapeHtml(message) + '</div>';

        context.response.writePage(errorForm);
    };

    return {
        onRequest: onRequest
    };
});