/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Vendor Center - Company Lead Creation
 *
 * Required account configuration:
 * 1. Create an Entity custom field on Customer/Lead:
 *      Label: Created By Vendor
 *      ID:    custentity_ih_created_by_vendor
 *      Type:  List/Record -> Vendor
 *      Applies To: Customer (Lead)
 * 2. Create the script parameters listed in the deployment notes.
 * 3. The Vendor Center role must be allowed to access this Suitelet.
 */
define([
    'N/ui/serverWidget',
    'N/record',
    'N/runtime',
    'N/search',
    'N/url'
], (serverWidget, record, runtime, search, url) => {

    const CONFIG = {
        leadRecordType: 'lead',
        vendorFieldId: 'custentity_ih_created_by_vendor',
        customFormScriptId: 'custform_ih_spl_lead',
        // Add your custom Lead body fields here after creating matching
        // Suitelet fields. Example is provided in addCustomLeadFields().
        customFields: []
    };

    const PARAMS = {
        customFormInternalId: 'custscript_ih_lead_customform_id',
        leadStatusInternalId: 'custscript_ih_lead_status_id'
    };

    const getScriptParameter = (name) =>
        runtime.getCurrentScript().getParameter({ name });

    const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const addTextField = (form, id, label, options = {}) => {
        const field = form.addField({
            id,
            type: options.type || serverWidget.FieldType.TEXT,
            label,
            container: options.container
        });
        if (options.mandatory) field.isMandatory = true;
        if (options.defaultValue !== undefined) field.defaultValue = options.defaultValue;
        if (options.help) field.setHelpText({ help: options.help });
        if (options.displayType) field.updateDisplayType({ displayType: options.displayType });
        return field;
    };

    const addCustomLeadFields = (form) => {
        /*
         * Add the custom fields from custform_ih_spl_lead here.
         * Example:
         *
         * addTextField(form, 'custpage_industry_detail', 'Industry');
         *
         * Then add a mapping in CONFIG.customFields:
         * { pageId: 'custpage_industry_detail', fieldId: 'custentity_ih_industry_detail' }
         *
         * For List/Record fields, use serverWidget.FieldType.SELECT and configure
         * the source/list appropriately. The custom field must also be available
         * on the Lead entity record.
         */
        CONFIG.customFields.forEach((item) => {
            addTextField(form, item.pageId, item.label || item.pageId, {
                mandatory: !!item.mandatory
            });
        });
    };

    const createLeadForm = () => {
        const form = serverWidget.createForm({
            title: 'Create New Lead'
        });

        form.addField({
            id: 'custpage_lead_header',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue = `
<style>
    .lead-page{max-width:1120px;margin:18px auto 35px;padding:0 14px;font-family:Arial,sans-serif;color:#263445}
    .lead-card{background:#fff;border:1px solid #e3e8ef;border-radius:13px;padding:26px;box-shadow:0 4px 18px rgba(20,35,55,.06)}
    .lead-heading{display:flex;gap:14px;align-items:center;padding-bottom:19px;margin-bottom:20px;border-bottom:1px solid #edf0f4}
    .lead-mark{width:48px;height:48px;border-radius:10px;background:#eaf2ff;display:flex;align-items:center;justify-content:center;font-size:24px}
    .lead-title{font-size:23px;font-weight:650;margin:0;color:#1f2937}
    .lead-subtitle{font-size:13px;color:#6b7280;margin-top:5px;line-height:1.5}
    .lead-note{padding:13px 15px;background:#eff6ff;border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:7px;color:#1e3a8a;font-size:13px;line-height:1.6;margin:14px 0 20px}
    .lead-section{font-size:15px;font-weight:650;color:#374151;margin:20px 0 7px}
    .lead-footer{font-size:11px;color:#9ca3af;text-align:center;margin-top:22px;padding-top:15px;border-top:1px solid #edf0f4}
    .uir-field-wrapper{margin-bottom:10px}
    @media(max-width:650px){.lead-card{padding:17px}.lead-title{font-size:20px}}
</style>
<div class="lead-page"><div class="lead-card">
  <div class="lead-heading"><div class="lead-mark">＋</div><div>
    <h1 class="lead-title">Create New Company Lead</h1>
    <div class="lead-subtitle">Submit a potential customer or business opportunity to our team.</div>
  </div></div>
  <div class="lead-note"><strong>Before submitting:</strong> Please provide accurate company and contact information. Your Vendor account will automatically be recorded as the Lead submitter.</div>
  <div class="lead-section">Company and Contact Information</div>
</div></div>`;

        form.addFieldGroup({ id: 'custpage_company_group', label: 'Company Information' });
        addTextField(form, 'custpage_companyname', 'Company Name', {
            container: 'custpage_company_group', mandatory: true
        });
        addTextField(form, 'custpage_email', 'Email', {
            container: 'custpage_company_group', type: serverWidget.FieldType.EMAIL
        });
        addTextField(form, 'custpage_phone', 'Phone', {
            container: 'custpage_company_group', type: serverWidget.FieldType.PHONE
        });
        addTextField(form, 'custpage_altphone', 'Alternate Phone', {
            container: 'custpage_company_group', type: serverWidget.FieldType.PHONE
        });
        addTextField(form, 'custpage_fax', 'Fax', {
            container: 'custpage_company_group'
        });
        addTextField(form, 'custpage_website', 'Website', {
            container: 'custpage_company_group', type: serverWidget.FieldType.URL
        });

        form.addFieldGroup({ id: 'custpage_additional_group', label: 'Additional Information' });
        addTextField(form, 'custpage_title', 'Contact Job Title', {
            container: 'custpage_additional_group'
        });
        const comments = form.addField({
            id: 'custpage_comments',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Lead Description / Comments',
            container: 'custpage_additional_group'
        });
        comments.updateDisplaySize({ height: 5, width: 70 });

        addCustomLeadFields(form);

        form.addField({
            id: 'custpage_lead_footer',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue = '<div class="lead-page"><div class="lead-footer">Vendor Center Lead Submission &nbsp;•&nbsp; NetSuite</div></div>';

        form.addSubmitButton({ label: 'Submit Lead' });
        form.addResetButton({ label: 'Reset Form' });
        return form;
    };

    const validateVendorSession = () => {
        const vendorId = runtime.getCurrentUser().id;
        if (!vendorId || Number(vendorId) <= 0) {
            throw new Error('Unable to identify the logged-in Vendor. Please sign in through Vendor Center.');
        }

        // Confirm the session user maps to a Vendor record.
        const vendorRec = record.load({
            type: record.Type.VENDOR,
            id: vendorId,
            isDynamic: false
        });

        return {
            id: String(vendorId),
            name: vendorRec.getValue({ fieldId: 'entityid' }) || vendorRec.getValue({ fieldId: 'companyname' }) || ('Vendor ' + vendorId)
        };
    };

    const findDuplicateLeadByEmail = (email) => {
        if (!email) return null;
        let duplicateId = null;
        search.create({
            type: CONFIG.leadRecordType,
            filters: [
                ['email', 'is', email],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: ['internalid']
        }).run().each((result) => {
            duplicateId = result.getValue({ name: 'internalid' });
            return false;
        });
        return duplicateId;
    };

    const setIfProvided = (rec, fieldId, value) => {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            rec.setValue({ fieldId, value: String(value).trim() });
        }
    };

    const createLead = (request, vendor) => {
        const params = request.parameters;
        const companyName = String(params.custpage_companyname || '').trim();
        const email = String(params.custpage_email || '').trim();

        if (!companyName) throw new Error('Company Name is required.');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Please enter a valid email address.');
        }

        const duplicateId = findDuplicateLeadByEmail(email);
        if (duplicateId) {
            throw new Error('A Lead with this email address already exists (Lead internal ID: ' + duplicateId + '). Please contact our team if you believe this is a new opportunity.');
        }

        const customFormId = getScriptParameter(PARAMS.customFormInternalId);
        const leadStatusId = getScriptParameter(PARAMS.leadStatusInternalId);
        if (!customFormId || !/^\d+$/.test(String(customFormId))) {
            throw new Error('Suitelet configuration is incomplete: set the Custom Lead Form internal ID deployment parameter.');
        }
        if (!leadStatusId || !/^\d+$/.test(String(leadStatusId))) {
            throw new Error('Suitelet configuration is incomplete: set the default Lead Status internal ID deployment parameter.');
        }

        const leadRec = record.create({
            type: CONFIG.leadRecordType,
            isDynamic: false
        });

        leadRec.setValue({ fieldId: 'customform', value: Number(customFormId) });
        leadRec.setValue({ fieldId: 'isperson', value: false });
        leadRec.setValue({ fieldId: 'companyname', value: companyName });
        leadRec.setValue({ fieldId: 'entitystatus', value: Number(leadStatusId) });

        setIfProvided(leadRec, 'email', email);
        setIfProvided(leadRec, 'phone', params.custpage_phone);
        setIfProvided(leadRec, 'altphone', params.custpage_altphone);
        setIfProvided(leadRec, 'fax', params.custpage_fax);
        setIfProvided(leadRec, 'url', params.custpage_website);
        setIfProvided(leadRec, 'title', params.custpage_title);
        setIfProvided(leadRec, 'comments', params.custpage_comments);

        // Automatically associate the Lead with the authenticated Vendor.
        leadRec.setValue({
            fieldId: CONFIG.vendorFieldId,
            value: Number(vendor.id)
        });

        // Map configured custom entity fields.
        CONFIG.customFields.forEach((item) => {
            const value = params[item.pageId];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                leadRec.setValue({ fieldId: item.fieldId, value: item.valueType === 'number' ? Number(value) : String(value).trim() });
            }
        });

        return leadRec.save({
            enableSourcing: true,
            ignoreMandatoryFields: false
        });
    };

    const createSuccessPage = (leadId, companyName, vendorName, suiteletUrl) => {
        const form = serverWidget.createForm({ title: 'Lead Submitted Successfully' });
        const html = form.addField({
            id: 'custpage_success_html',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        html.defaultValue = `
<style>
.success-wrap{max-width:760px;margin:35px auto;padding:0 15px;font-family:Arial,sans-serif;color:#263445}
.success-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:34px;box-shadow:0 5px 22px rgba(0,0,0,.07);text-align:center}
.success-icon{width:66px;height:66px;margin:0 auto 17px;border-radius:50%;background:#dcfce7;color:#166534;display:flex;align-items:center;justify-content:center;font-size:34px}
.success-title{font-size:25px;font-weight:650;color:#166534;margin-bottom:8px}
.success-sub{font-size:14px;color:#6b7280;margin-bottom:25px}
.success-details{padding:17px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:left}
.detail{display:flex;gap:15px;padding:11px 0;border-bottom:1px solid #e5e7eb;font-size:13px}
.detail:last-child{border-bottom:0}.detail-label{width:155px;min-width:155px;font-weight:600;color:#374151}.detail-value{color:#4b5563;overflow-wrap:anywhere}
.success-note{margin-top:20px;padding:14px;background:#eff6ff;border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:7px;text-align:left;font-size:13px;line-height:1.6;color:#1e3a8a}
@media(max-width:600px){.success-card{padding:22px}.detail{display:block}.detail-label{width:auto;margin-bottom:5px}}
</style>
<div class="success-wrap"><div class="success-card">
  <div class="success-icon">✓</div>
  <div class="success-title">Lead Submitted Successfully!</div>
  <div class="success-sub">Thank you. Your company Lead has been submitted to our team.</div>
  <div class="success-details">
    <div class="detail"><div class="detail-label">Lead Internal ID</div><div class="detail-value">${escapeHtml(leadId)}</div></div>
    <div class="detail"><div class="detail-label">Company</div><div class="detail-value">${escapeHtml(companyName)}</div></div>
    <div class="detail"><div class="detail-label">Submitted By</div><div class="detail-value">${escapeHtml(vendorName)}</div></div>
    <div class="detail"><div class="detail-label">Record Type</div><div class="detail-value">Lead</div></div>
  </div>
  <div class="success-note"><strong>What happens next?</strong><br>Our team will review the submitted information and follow up if additional details are required.</div>
</div></div>`;

        const clientScript = form.addField({
            id: 'custpage_success_script',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        clientScript.defaultValue = `<script>function createAnotherLead(){window.location.href=${JSON.stringify(suiteletUrl)};}</script>`;
        form.addButton({
            id: 'custpage_create_another',
            label: 'Create Another Lead',
            functionName: 'createAnotherLead'
        });
        return form;
    };

    const createErrorPage = (message, suiteletUrl) => {
        const form = serverWidget.createForm({ title: 'Lead Submission Error' });
        const html = form.addField({ id: 'custpage_error_html', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        html.defaultValue = `
<style>.err-wrap{max-width:720px;margin:35px auto;padding:0 15px;font-family:Arial,sans-serif}.err-card{padding:28px;background:#fff;border:1px solid #fecaca;border-radius:12px}.err-title{font-size:22px;color:#991b1b;font-weight:650;margin-bottom:10px}.err-text{font-size:14px;line-height:1.6;color:#4b5563}</style>
<div class="err-wrap"><div class="err-card"><div class="err-title">Unable to Submit Lead</div><div class="err-text">${escapeHtml(message)}</div></div></div>`;
        const script = form.addField({ id: 'custpage_error_script', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        script.defaultValue = `<script>function returnToLeadForm(){window.location.href=${JSON.stringify(suiteletUrl)};}</script>`;
        form.addButton({ id: 'custpage_back', label: 'Back to Lead Form', functionName: 'returnToLeadForm' });
        return form;
    };

    const getSuiteletUrl = () => url.resolveScript({
        scriptId: runtime.getCurrentScript().id,
        deploymentId: runtime.getCurrentScript().deploymentId,
        returnExternalUrl: false
    });

    const onRequest = (context) => {
        const suiteletUrl = getSuiteletUrl();
        try {
            // Confirm the current Vendor Center session on both GET and POST.
            const vendor = validateVendorSession();

            if (context.request.method === 'GET') {
                context.response.writePage(createLeadForm());
                return;
            }

            const leadId = createLead(context.request, vendor);
            context.response.writePage(
                createSuccessPage(leadId, context.request.parameters.custpage_companyname, vendor.name, suiteletUrl)
            );
        } catch (e) {
            log.error({ title: 'Vendor Center Lead Creation Error', details: e });
            context.response.writePage(createErrorPage(e.message || 'An unexpected error occurred.', suiteletUrl));
        }
    };

    return { onRequest };
});
