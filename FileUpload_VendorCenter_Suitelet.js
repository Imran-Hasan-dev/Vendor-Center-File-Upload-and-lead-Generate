/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define([
    'N/ui/serverWidget',
    'N/file',
    'N/search',
    'N/record',
    'N/runtime',
    'N/url'
], (
    serverWidget,
    file,
    search,
    record,
    runtime,
    url
) => {

    /**
     * Escape HTML
     */
    const escapeHtml = (value) => {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    /**
     * Create Upload Form
     */
    const createUploadForm = () => {
        const form = serverWidget.createForm({
            title: 'Vendor Document Upload'
        });

        /**
         * Actual NetSuite File Upload Field
         *
         * This field remains on the form so the selected
         * file is available through context.request.files.
         */
        const fileField = form.addField({
            id: 'custpage_file',
            type: serverWidget.FieldType.FILE,
            label: 'Select File'
        });

        fileField.isMandatory = true;

        /**
         * Custom Upload UI
         */
        const htmlField = form.addField({
            id: 'custpage_instructions',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        htmlField.defaultValue = `
<style>
* {
    box-sizing: border-box;
}

.upload-wrapper {
    width: 100%;
    max-width: 1100px;
    margin: 20px auto;
    padding: 0 15px 30px;
    font-family: Arial, Helvetica, sans-serif;
    color: #1f2937;
}

.upload-card {
    width: 100%;
    background: #ffffff;
    border: 1px solid #e1e5ea;
    border-radius: 14px;
    padding: 30px;
    box-shadow: 0 5px 22px rgba(0, 0, 0, 0.07);
}

/* ============================================================
   HEADER
   ============================================================ */

.upload-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 25px;
    padding-bottom: 20px;
    border-bottom: 1px solid #edf0f3;
}

.upload-icon {
    width: 54px;
    height: 54px;
    min-width: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eaf2ff;
    border: 1px solid #d5e5ff;
    border-radius: 11px;
    font-size: 27px;
}

.upload-title {
    margin: 0;
    color: #1f2937;
    font-size: 24px;
    line-height: 1.3;
    font-weight: 600;
}

.upload-subtitle {
    margin-top: 5px;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.5;
}

/* ============================================================
   TWO COLUMN LAYOUT
   ============================================================ */

.upload-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.95fr);
    gap: 24px;
    align-items: start;
}

.upload-main {
    min-width: 0;
}

.upload-sidebar {
    min-width: 0;
}

/* ============================================================
   UPLOAD BOX
   ============================================================ */

.file-upload-box {
    position: relative;
    width: 100%;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 25px;
    background: #fafcff;
    border: 2px dashed #c5ced8;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;
}

.file-upload-box:hover {
    background: #f5f9ff;
    border-color: #2563eb;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
}

.file-upload-box.dragover {
    background: #eef6ff;
    border-color: #1769aa;
    box-shadow: 0 0 0 4px rgba(37, 105, 170, 0.08);
    transform: translateY(-1px);
}

.file-upload-icon {
    width: 68px;
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    background: #eaf2ff;
    border-radius: 50%;
    font-size: 32px;
}

.file-upload-main-text {
    margin-bottom: 7px;
    color: #273142;
    font-size: 17px;
    font-weight: 600;
}

.file-upload-secondary-text {
    max-width: 550px;
    margin-bottom: 20px;
    color: #7b8491;
    font-size: 13px;
    line-height: 1.55;
}

/* ============================================================
   CHOOSE FILE BUTTON
   ============================================================ */

.choose-file-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 125px;
    padding: 10px 20px;
    background: #1769aa;
    color: #ffffff;
    border: 1px solid #1769aa;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background-color 0.2s ease,
        border-color 0.2s ease,
        box-shadow 0.2s ease;
}

.choose-file-button:hover {
    background: #0f578d;
    border-color: #0f578d;
    box-shadow: 0 3px 8px rgba(15, 87, 141, 0.2);
}

/* ============================================================
   SELECTED FILE
   ============================================================ */

.selected-file {
    width: 100%;
    max-width: 620px;
    display: none;
    margin: 20px auto 0;
    padding: 14px 17px;
    background: #f6ffed;
    border: 1px solid #b7eb8f;
    border-radius: 7px;
    text-align: left;
}

.selected-file-name {
    color: #237804;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
    word-break: break-word;
}

.selected-file-size {
    margin-top: 4px;
    color: #527a3c;
    font-size: 12px;
}

/* ============================================================
   IMPORTANT INFORMATION
   ============================================================ */

.notice {
    margin-top: 20px;
    padding: 17px 19px;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-left: 4px solid #2563eb;
    border-radius: 7px;
    color: #1e3a8a;
}

.notice-title {
    margin-bottom: 7px;
    color: #1e40af;
    font-size: 14px;
    font-weight: 600;
}

.notice-text {
    color: #36558c;
    font-size: 13px;
    line-height: 1.65;
}

/* ============================================================
   DOCUMENT INFORMATION
   ============================================================ */

.file-section {
    margin-top: 18px;
    padding: 17px 18px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}

.file-section-title {
    margin-bottom: 7px;
    color: #374151;
    font-size: 14px;
    font-weight: 600;
}

.file-help {
    color: #6b7280;
    font-size: 12px;
    line-height: 1.6;
}

/* ============================================================
   RIGHT SIDEBAR
   ============================================================ */

.sidebar-section {
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 20px;
}

.sidebar-title {
    margin-bottom: 17px;
    color: #374151;
    font-size: 16px;
    font-weight: 600;
}

/* ============================================================
   UPLOAD STEPS
   ============================================================ */

.steps {
    display: flex;
    flex-direction: column;
    gap: 11px;
}

.step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 13px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;
}

.step:hover {
    border-color: #cbd5e1;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
    transform: translateY(-1px);
}

.step-number {
    width: 30px;
    height: 30px;
    min-width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2563eb;
    color: #ffffff;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
}

.step-content {
    flex: 1;
    min-width: 0;
}

.step-title {
    margin-bottom: 4px;
    color: #374151;
    font-size: 13px;
    font-weight: 600;
}

.step-text {
    color: #6b7280;
    font-size: 12px;
    line-height: 1.5;
}

/* ============================================================
   FILE NAMING REMINDER
   ============================================================ */

.naming-note {
    margin-top: 16px;
    padding: 16px;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-left: 4px solid #f97316;
    border-radius: 8px;
    color: #9a3412;
    font-size: 12px;
    line-height: 1.6;
}

.naming-title {
    margin-bottom: 6px;
    color: #9a3412;
    font-size: 14px;
    font-weight: 600;
}

.example {
    display: inline-block;
    margin-top: 3px;
    padding: 4px 7px;
    background: #ffffff;
    border: 1px solid #fed7aa;
    border-radius: 4px;
    color: #7c2d12;
    font-family: Consolas, Monaco, monospace;
    font-size: 11px;
}

/* ============================================================
   AUTOMATIC ATTACHMENT
   ============================================================ */

.security-note {
    margin-top: 16px;
    padding: 16px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 4px solid #22c55e;
    border-radius: 8px;
    color: #166534;
    font-size: 12px;
    line-height: 1.6;
}

/* ============================================================
   FOOTER
   ============================================================ */

.footer-note {
    margin-top: 25px;
    padding-top: 17px;
    border-top: 1px solid #edf0f3;
    color: #9ca3af;
    font-size: 11px;
    text-align: center;
}

/* ============================================================
   HIDE NATIVE NETSUITE FILE FIELD
   ============================================================ */

input[type="file"] {
    font-family: Arial, Helvetica, sans-serif;
}

/* ============================================================
   TABLET
   ============================================================ */

@media (max-width: 850px) {

    .upload-card {
        padding: 25px;
    }

    .upload-layout {
        grid-template-columns: 1fr;
    }

    .upload-sidebar {
        margin-top: 0;
    }

    .steps {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
    }
}

/* ============================================================
   MOBILE
   ============================================================ */

@media (max-width: 600px) {

    .upload-wrapper {
        margin: 15px auto;
        padding: 0 8px 25px;
    }

    .upload-card {
        padding: 18px;
        border-radius: 10px;
    }

    .upload-header {
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 20px;
        padding-bottom: 17px;
    }

    .upload-icon {
        width: 46px;
        height: 46px;
        min-width: 46px;
        font-size: 23px;
        border-radius: 9px;
    }

    .upload-title {
        font-size: 20px;
    }

    .upload-subtitle {
        font-size: 12px;
    }

    .file-upload-box {
        min-height: 240px;
        padding: 30px 17px;
    }

    .file-upload-icon {
        width: 58px;
        height: 58px;
        font-size: 28px;
    }

    .file-upload-main-text {
        font-size: 15px;
    }

    .file-upload-secondary-text {
        font-size: 12px;
    }

    .steps {
        grid-template-columns: 1fr;
    }

    .step {
        min-height: auto;
    }

    .notice,
    .file-section,
    .naming-note,
    .security-note {
        padding: 14px 15px;
    }
}

/* ============================================================
   VERY SMALL SCREENS
   ============================================================ */

@media (max-width: 400px) {

    .upload-card {
        padding: 14px;
    }

    .upload-title {
        font-size: 18px;
    }

    .file-upload-box {
        padding: 25px 12px;
    }

    .choose-file-button {
        width: 100%;
        max-width: 180px;
    }
}
</style>

<div class="upload-wrapper">

    <div class="upload-card">

        <!-- Header -->
        <div class="upload-header">

            <div class="upload-icon">
                📄
            </div>

            <div>
                <h1 class="upload-title">
                    Upload Vendor Document
                </h1>

                <div class="upload-subtitle">
                    Upload documents securely to your Vendor Master Record
                </div>
            </div>

        </div>

        <!-- Two Column Layout -->
        <div class="upload-layout">

            <!-- ====================================================
                 LEFT SIDE
                 ==================================================== -->

            <div class="upload-main">

                <!-- Upload Box -->
                <div
                    class="file-upload-box"
                    id="customUploadBox"
                >

                    <div class="file-upload-icon">
                        📁
                    </div>

                    <div class="file-upload-main-text">
                        Choose a file to upload
                    </div>

                    <div class="file-upload-secondary-text">
                        Click the button below or drag and drop your
                        document here
                    </div>

                    <label
                        class="choose-file-button"
                        id="chooseFileButton"
                    >
                        Choose File
                    </label>

                    <!-- Selected File -->
                    <div
                        class="selected-file"
                        id="selectedFile"
                    >

                        <div
                            class="selected-file-name"
                            id="selectedFileName"
                        ></div>

                        <div
                            class="selected-file-size"
                            id="selectedFileSize"
                        ></div>

                    </div>

                </div>

                <!-- Important Information -->
                <div class="notice">

                    <div class="notice-title">
                        📌 Important Information
                    </div>

                    <div class="notice-text">

                        Any file you upload here will be automatically
                        saved in the designated Vendor folder and
                        attached to your
                        <strong>Vendor Master Record</strong>
                        in NetSuite.

                        <br><br>

                        <strong>
                            Please make sure the file is correctly
                            named before uploading.
                        </strong>

                        You will not need to attach the file manually
                        after uploading.

                    </div>

                </div>

                <!-- Document Information -->
                <div class="file-section">

                    <div class="file-section-title">
                        📎 Document to Upload
                    </div>

                    <div class="file-help">

                        Select your document using the upload area above.

                        <br>

                        Before uploading, please confirm that you have
                        selected the correct and latest version of the file.

                    </div>

                </div>

            </div>

            <!-- ====================================================
                 RIGHT SIDE
                 ==================================================== -->

            <div class="upload-sidebar">

                <!-- Upload Guide -->
                <div class="sidebar-section">

                    <div class="sidebar-title">
                        📋 How to Upload
                    </div>

                    <div class="steps">

                        <!-- Step 1 -->
                        <div class="step">

                            <div class="step-number">
                                1
                            </div>

                            <div class="step-content">

                                <div class="step-title">
                                    Rename Your File
                                </div>

                                <div class="step-text">
                                    Give your document a clear and
                                    meaningful file name before uploading.
                                </div>

                            </div>

                        </div>

                        <!-- Step 2 -->
                        <div class="step">

                            <div class="step-number">
                                2
                            </div>

                            <div class="step-content">

                                <div class="step-title">
                                    Select File
                                </div>

                                <div class="step-text">
                                    Select the properly named document
                                    from your computer.
                                </div>

                            </div>

                        </div>

                        <!-- Step 3 -->
                        <div class="step">

                            <div class="step-number">
                                3
                            </div>

                            <div class="step-content">

                                <div class="step-title">
                                    Upload
                                </div>

                                <div class="step-text">
                                    Click the Upload Document button
                                    below to save your document.
                                </div>

                            </div>

                        </div>

                        <!-- Step 4 -->
                        <div class="step">

                            <div class="step-number">
                                4
                            </div>

                            <div class="step-content">

                                <div class="step-title">
                                    Automatically Attached
                                </div>

                                <div class="step-text">
                                    The document will automatically
                                    be attached to your Vendor Master Record.
                                </div>

                            </div>

                        </div>

                    </div>

                </div>

                <!-- File Naming Reminder -->
                <div class="naming-note">

                    <div class="naming-title">
                        ⚠️ File Naming Reminder
                    </div>

                    Please rename the file properly and use a clear,
                    meaningful file name based on the document contents
                    <strong>before uploading</strong>.

                    <br><br>

                    <strong>Examples:</strong>

                    <br>

                    <span class="example">
                        Trade_License_2026.pdf
                    </span>

                    <br>

                    <span class="example">
                        Bank_Statement_July_2026.pdf
                    </span>

                    <br>

                    <span class="example">
                        Tax_Certificate_2026.pdf
                    </span>

                    <br><br>

                    A properly named file makes it easier to identify,
                    manage, and retrieve documents later.

                </div>

                <!-- Automatic Attachment Note -->
                <div class="security-note">

                    <strong>
                        🔗 Automatic Attachment
                    </strong>

                    <br><br>

                    Once uploaded, the file will be stored in your
                    designated Vendor folder in the NetSuite File Cabinet
                    and automatically attached to your
                    <strong>Vendor Master Record</strong>.

                    <br><br>

                    <strong>
                        No additional attachment action is required.
                    </strong>

                </div>

            </div>

        </div>

        <!-- Footer -->
        <div class="footer-note">
            Vendor Document Management &nbsp;•&nbsp; NetSuite
        </div>

    </div>

</div>

<script>
(function() {

    var uploadBox =
        document.getElementById('customUploadBox');

    var chooseButton =
        document.getElementById('chooseFileButton');

    var selectedFile =
        document.getElementById('selectedFile');

    var selectedFileName =
        document.getElementById('selectedFileName');

    var selectedFileSize =
        document.getElementById('selectedFileSize');

    /**
     * Find the actual NetSuite FILE input.
     */
    var fileInput =
        document.querySelector('input[type="file"]');

    if (!fileInput) {
        return;
    }

    /**
     * Hide the native NetSuite file field.
     */
    var fileContainer =
        fileInput.closest('.uir-field-wrapper');

    if (fileContainer) {
        fileContainer.style.display = 'none';
    }

    /**
     * Format file size.
     */
    function formatFileSize(bytes) {

        if (!bytes) {
            return '0 Bytes';
        }

        var units = [
            'Bytes',
            'KB',
            'MB',
            'GB'
        ];

        var index =
            Math.floor(
                Math.log(bytes) / Math.log(1024)
            );

        index =
            Math.min(
                index,
                units.length - 1
            );

        return (
            bytes /
            Math.pow(1024, index)
        ).toFixed(2) +
        ' ' +
        units[index];
    }

    /**
     * Display selected file.
     */
    function displaySelectedFile(selected) {

        if (!selected) {

            selectedFile.style.display =
                'none';

            selectedFileName.textContent =
                '';

            selectedFileSize.textContent =
                '';

            return;
        }

        selectedFileName.textContent =
            '📄 Selected file: ' +
            selected.name;

        selectedFileSize.textContent =
            'Size: ' +
            formatFileSize(selected.size);

        selectedFile.style.display =
            'block';
    }

    /**
     * Choose File button.
     */
    chooseButton.addEventListener(
        'click',
        function(e) {

            e.preventDefault();
            e.stopPropagation();

            fileInput.click();
        }
    );

    /**
     * Clicking the upload box opens
     * the file selection window.
     */
    uploadBox.addEventListener(
        'click',
        function(e) {

            if (
                e.target === chooseButton ||
                chooseButton.contains(e.target)
            ) {
                return;
            }

            fileInput.click();
        }
    );

    /**
     * File selected.
     */
    fileInput.addEventListener(
        'change',
        function() {

            if (
                fileInput.files &&
                fileInput.files.length > 0
            ) {

                displaySelectedFile(
                    fileInput.files[0]
                );

            } else {

                displaySelectedFile(null);
            }
        }
    );

    /**
     * Drag over.
     */
    uploadBox.addEventListener(
        'dragover',
        function(e) {

            e.preventDefault();
            e.stopPropagation();

            uploadBox.classList.add(
                'dragover'
            );
        }
    );

    /**
     * Drag leave.
     */
    uploadBox.addEventListener(
        'dragleave',
        function(e) {

            e.preventDefault();
            e.stopPropagation();

            uploadBox.classList.remove(
                'dragover'
            );
        }
    );

    /**
     * Drop file.
     */
    uploadBox.addEventListener(
        'drop',
        function(e) {

            e.preventDefault();
            e.stopPropagation();

            uploadBox.classList.remove(
                'dragover'
            );

            if (
                e.dataTransfer &&
                e.dataTransfer.files &&
                e.dataTransfer.files.length > 0
            ) {

                try {

                    var dataTransfer =
                        new DataTransfer();

                    dataTransfer.items.add(
                        e.dataTransfer.files[0]
                    );

                    fileInput.files =
                        dataTransfer.files;

                    fileInput.dispatchEvent(
                        new Event(
                            'change',
                            {
                                bubbles: true
                            }
                        )
                    );

                } catch (err) {

                    console.log(
                        'File drop error:',
                        err
                    );
                }
            }
        }
    );

})();
</script>
`;

        /**
         * Upload Button
         */
        form.addSubmitButton({
            label: '📤 Upload Document'
        });

        /**
         * Reset Button
         */
        form.addResetButton({
            label: 'Reset'
        });

        return form;
    };

    /**
     * Create Success Page
     */
    const createSuccessPage = (
        vendorName,
        fileName,
        suiteletUrl
    ) => {

        const form = serverWidget.createForm({
            title: 'Document Uploaded Successfully'
        });

        const successField = form.addField({
            id: 'custpage_success',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        successField.defaultValue = `
<style>
* {
    box-sizing: border-box;
}

.success-wrapper {
    max-width: 800px;
    margin: 30px auto;
    padding: 0 15px 30px;
    font-family: Arial, Helvetica, sans-serif;
}

.success-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 35px;
    box-shadow: 0 5px 22px rgba(0, 0, 0, 0.07);
    text-align: center;
}

.success-icon {
    width: 70px;
    height: 70px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    border-radius: 50%;
    color: #166534;
    font-size: 36px;
    font-weight: 600;
}

.success-title {
    margin-bottom: 8px;
    color: #166534;
    font-size: 26px;
    font-weight: 600;
}

.success-subtitle {
    margin-bottom: 30px;
    color: #6b7280;
    font-size: 14px;
}

.details {
    padding: 20px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    text-align: left;
}

.detail-row {
    display: flex;
    padding: 12px 0;
    border-bottom: 1px solid #e5e7eb;
}

.detail-row:last-child {
    border-bottom: none;
}

.detail-label {
    width: 180px;
    min-width: 180px;
    color: #374151;
    font-weight: 600;
}

.detail-value {
    flex: 1;
    color: #4b5563;
    word-break: break-word;
}

.attached-message {
    margin-top: 22px;
    padding: 17px;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-left: 4px solid #2563eb;
    border-radius: 7px;
    color: #1e3a8a;
    font-size: 13px;
    line-height: 1.6;
    text-align: left;
}

.success-highlight {
    margin-top: 18px;
    padding: 14px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 7px;
    color: #166534;
    font-size: 13px;
}

.success-footer {
    margin-top: 25px;
    color: #9ca3af;
    font-size: 11px;
}

/* Mobile */
@media (max-width: 600px) {

    .success-card {
        padding: 22px;
    }

    .success-title {
        font-size: 22px;
    }

    .detail-row {
        display: block;
    }

    .detail-label {
        width: auto;
        min-width: 0;
        margin-bottom: 5px;
    }
}
</style>

<div class="success-wrapper">

    <div class="success-card">

        <!-- Success Icon -->
        <div class="success-icon">
            ✓
        </div>

        <!-- Title -->
        <div class="success-title">
            Upload Successful!
        </div>

        <div class="success-subtitle">
            Your document has been successfully uploaded.
        </div>

        <!-- File Details -->
        <div class="details">

            <div class="detail-row">

                <div class="detail-label">
                    Vendor
                </div>

                <div class="detail-value">
                    ${escapeHtml(vendorName)}
                </div>

            </div>

            <div class="detail-row">

                <div class="detail-label">
                    File Name
                </div>

                <div class="detail-value">
                    ${escapeHtml(fileName)}
                </div>

            </div>

            <div class="detail-row">

                <div class="detail-label">
                    Storage Folder
                </div>

                <div class="detail-value">
                    ${escapeHtml(vendorName)}
                </div>

            </div>

        </div>

        <!-- Attachment Confirmation -->
        <div class="attached-message">

            <strong>
                📎 File Attached to Vendor Master Record
            </strong>

            <br><br>

            The uploaded document has been saved in the
            Vendor's designated folder and automatically
            attached to the
            <strong>Vendor Master Record</strong>
            in NetSuite.

            <br><br>

            <strong>
                No further action is required.
            </strong>

        </div>

        <!-- Success Highlight -->
        <div class="success-highlight">

            ✓ Your document is now available through
            the Vendor Master Record.

        </div>

        <div class="success-footer">
            Vendor Document Management &nbsp;•&nbsp; NetSuite
        </div>

    </div>

</div>
`;

        /**
         * Upload Another Document Button
         */
        form.addButton({
            id: 'custpage_upload_another',
            label: 'Upload Another Document',
            functionName: 'uploadAnother'
        });

        /**
         * Client Script
         */
        const clientScriptField = form.addField({
            id: 'custpage_client_script',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });

        clientScriptField.defaultValue = `
<script>
function uploadAnother() {
    window.location.href = ${JSON.stringify(suiteletUrl)};
}
</script>
`;

        return form;
    };

    /**
     * Suitelet Entry Point
     */
    const onRequest = (context) => {

        try {

            /**
             * GET
             * Display Upload Page
             */
            if (context.request.method === 'GET') {

                const form = createUploadForm();

                context.response.writePage(form);

                return;
            }

            /**
             * POST
             * Process Upload
             */
            const vendorId =
                runtime.getCurrentUser().id;

            /**
             * Deployment Parameter
             */
            const parentFolderId =
                runtime.getCurrentScript().getParameter({
                    name: 'custscript_parentfolder'
                });

            /**
             * Uploaded File
             */
            const uploadedFile =
                context.request.files.custpage_file;

            /**
             * Validate File
             */
            if (!uploadedFile) {

                throw Error(
                    'Please select a file before clicking Upload.'
                );
            }

            /**
             * Validate Vendor
             */
            if (!vendorId) {

                throw Error(
                    'Unable to identify the logged-in vendor.'
                );
            }

            /**
             * Load Vendor Record
             */
            const vendorRec = record.load({
                type: record.Type.VENDOR,
                id: vendorId
            });

            /**
             * Vendor Name
             */
            const vendorName =
                vendorRec.getValue({
                    fieldId: 'entityid'
                });

            /**
             * Search Vendor Folder
             */
            let folderId = null;

            const folderSearch = search.create({
                type: search.Type.FOLDER,
                filters: [
                    ['name', 'is', vendorName]
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    })
                ]
            });

            folderSearch.run().each(
                (result) => {

                    folderId =
                        result.getValue({
                            name: 'internalid'
                        });

                    return false;
                }
            );

            /**
             * Create Vendor Folder If Missing
             */
            if (!folderId) {

                const folderRec =
                    record.create({
                        type: record.Type.FOLDER
                    });

                folderRec.setValue({
                    fieldId: 'name',
                    value: vendorName
                });

                if (parentFolderId) {

                    folderRec.setValue({
                        fieldId: 'parent',
                        value: parentFolderId
                    });
                }

                folderId =
                    folderRec.save();
            }

            /**
             * Save File
             */
            uploadedFile.folder =
                folderId;

            const fileId =
                uploadedFile.save();

            /**
             * Attach File to Vendor Master Record
             */
            record.attach({
                record: {
                    type: 'file',
                    id: fileId
                },
                to: {
                    type: record.Type.VENDOR,
                    id: vendorId
                }
            });

            /**
             * Resolve Current Suitelet URL
             */
            const suiteletUrl =
                url.resolveScript({
                    scriptId:
                        runtime.getCurrentScript().id,

                    deploymentId:
                        runtime.getCurrentScript().deploymentId,

                    returnExternalUrl: false
                });

            /**
             * Display Success Page
             */
            const successForm =
                createSuccessPage(
                    vendorName,
                    uploadedFile.name,
                    suiteletUrl
                );

            context.response.writePage(
                successForm
            );

        } catch (e) {

            /**
             * Log Error
             */
            log.error({
                title:
                    'Vendor File Upload Error',

                details: e
            });

            /**
             * Friendly Error Page
             */
            const errorForm =
                serverWidget.createForm({
                    title: 'Upload Error'
                });

            const errorField =
                errorForm.addField({
                    id: 'custpage_error',
                    type:
                        serverWidget.FieldType.INLINEHTML,
                    label: ' '
                });

            errorField.defaultValue = `
<style>
.error-wrapper {
    max-width: 700px;
    margin: 40px auto;
    padding: 0 15px;
    font-family: Arial, Helvetica, sans-serif;
}

.error-card {
    padding: 30px;
    background: #ffffff;
    border: 1px solid #fecaca;
    border-radius: 12px;
    box-shadow: 0 5px 22px rgba(0, 0, 0, 0.07);
}

.error-icon {
    margin-bottom: 15px;
    font-size: 42px;
}

.error-title {
    margin-bottom: 10px;
    color: #991b1b;
    font-size: 22px;
    font-weight: 600;
}

.error-description {
    color: #4b5563;
    line-height: 1.6;
    font-size: 13px;
}

.error-message {
    margin-top: 20px;
    padding: 15px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-left: 4px solid #dc2626;
    border-radius: 6px;
    color: #991b1b;
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;
}

.error-footer {
    margin-top: 20px;
    color: #6b7280;
    font-size: 12px;
}
</style>

<div class="error-wrapper">

    <div class="error-card">

        <div class="error-icon">
            ⚠️
        </div>

        <div class="error-title">
            Upload Could Not Be Completed
        </div>

        <div class="error-description">
            We were unable to upload your document.
            Please review the information below and try again.
        </div>

        <div class="error-message">
            ${escapeHtml(e.message || e.toString())}
        </div>

        <div class="error-footer">
            If the problem continues, please contact your
            NetSuite administrator.
        </div>

    </div>

</div>
`;

            context.response.writePage(
                errorForm
            );
        }
    };

    /**
     * Return Entry Point
     */
    return {
        onRequest
    };
});