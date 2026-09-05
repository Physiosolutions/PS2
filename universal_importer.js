/**
 * UNIVERSAL DATA IMPORTER & MERGE ENGINE FOR PHYSIO SOLUTIONS
 * Comprehensive multi-module data import with intelligent Name & Date matching,
 * column auto-detection, SheetJS (.xlsx/.xls/.csv) parsing, and seamless state synchronization.
 */

(function () {
    'use strict';

    // Module Registry & Schema Definitions
    const IMPORTER_MODULES = {
        fdo_sheets: {
            name: "FDO Sheets / Daily Reception Logs",
            icon: "📋",
            description: "Daily reception figures, Aasandha / Software entries, and differences.",
            primaryKeyDesc: "Matched by Date (YYYY-MM-DD)",
            fields: [
                { key: "date", label: "Date", type: "date", required: true, aliases: ["date", "entry date", "day", "log date"] },
                { key: "aasandha", label: "Aasandha Amount", type: "number", required: false, aliases: ["aasandha", "aasandha amount", "aasandha total"] },
                { key: "newSoftware", label: "Software Amount", type: "number", required: false, aliases: ["software", "new software", "software amount", "system amount"] },
                { key: "difference", label: "Difference", type: "number", required: false, aliases: ["difference", "diff", "variance"] },
                { key: "remarks", label: "Remarks / Notes", type: "string", required: false, aliases: ["remarks", "notes", "comment", "comments", "description"] },
                { key: "filledBy", label: "Filled By (Staff)", type: "string", required: false, aliases: ["filled by", "staff", "fdo", "logged by", "user"] }
            ],
            sampleRows: [
                ["2026-03-01", "1250.00", "1250.00", "0.00", "Morning shift verified", "Admin"],
                ["2026-03-02", "1480.00", "1480.00", "0.00", "Reconciled with cash drawer", "Admin"]
            ]
        },
        patient_tracker: {
            name: "Patient Tracker & Appointments",
            icon: "🩺",
            description: "Patient prescriptions, session allotments, consult dates, and treatment status.",
            primaryKeyDesc: "Matched by National ID Card or Patient Name + Date",
            fields: [
                { key: "entryDate", label: "Entry Date", type: "date", required: true, aliases: ["entry date", "date", "reg date", "registration date"] },
                { key: "memoNo", label: "Memo / Bill No", type: "string", required: false, aliases: ["memo no", "memo", "memo number", "bill no", "receipt no"] },
                { key: "patientName", label: "Patient Name", type: "string", required: true, aliases: ["patient name", "name", "full name", "client name"] },
                { key: "idCard", label: "National ID Card", type: "string", required: false, aliases: ["id card", "id", "national id", "nid", "id number"] },
                { key: "prescriptionDate", label: "Prescription Date", type: "date", required: false, aliases: ["prescription date", "rx date", "presc date"] },
                { key: "prescriptionExpires", label: "Prescription Expiry", type: "date", required: false, aliases: ["prescription expires", "expiry date", "rx expiry", "valid until"] },
                { key: "sessions", label: "Total Sessions", type: "number", required: false, aliases: ["sessions", "total sessions", "allotted sessions"] },
                { key: "sessionsGiven", label: "Sessions Given", type: "number", required: false, aliases: ["sessions given", "attended", "sessions completed", "given"] },
                { key: "diagnosis", label: "Diagnosis / Condition", type: "string", required: false, aliases: ["diagnosis", "condition", "chief complaint", "reason"] },
                { key: "consultDate", label: "Consult Date", type: "date", required: false, aliases: ["consult date", "consultation date", "doctor consult"] },
                { key: "renewedSessions", label: "Renewed Sessions", type: "number", required: false, aliases: ["renewed sessions", "renewed", "extra sessions"] },
                { key: "status", label: "Status", type: "string", required: false, aliases: ["status", "patient status", "active", "state"] },
                { key: "remarks", label: "Remarks", type: "string", required: false, aliases: ["remarks", "notes", "treatment notes"] }
            ],
            sampleRows: [
                ["2026-03-01", "MEM-1049", "Aishath Moosa", "A098765", "2026-02-15", "2026-06-15", "12", "4", "Cervical Spondylosis", "2026-02-15", "0", "Active", "Improving with neck exercises"],
                ["2026-03-02", "MEM-1050", "Ibrahim Rasheed", "A123456", "2026-02-20", "2026-06-20", "10", "2", "Lumbar Disc Herniation", "2026-02-20", "0", "Active", "Core strengthening in progress"]
            ]
        },
        solarelle_patients: {
            name: "Solarelle Patients (Insurance Billing)",
            icon: "📑",
            description: "Solarelle insurance claims, co-payment percentages, and breakdown figures.",
            primaryKeyDesc: "Matched by National ID Card + Date or Patient Name + Date",
            fields: [
                { key: "date", label: "Date", type: "date", required: true, aliases: ["date", "claim date", "treatment date", "bill date"] },
                { key: "patientName", label: "Patient Name", type: "string", required: true, aliases: ["patient name", "name", "full name"] },
                { key: "idCard", label: "National ID Card", type: "string", required: false, aliases: ["id card", "id", "national id", "nid"] },
                { key: "contact", label: "Contact No", type: "string", required: false, aliases: ["contact", "phone", "mobile", "contact no"] },
                { key: "doctor", label: "Doctor", type: "string", required: false, aliases: ["doctor", "physician", "ref doctor", "dr"] },
                { key: "diagnosis", label: "Diagnosis", type: "string", required: false, aliases: ["diagnosis", "condition"] },
                { key: "totalAmount", label: "Total Amount", type: "number", required: true, aliases: ["total amount", "total", "bill amount", "gross"] },
                { key: "solarellePercent", label: "Solarelle %", type: "number", required: false, aliases: ["solarelle percent", "solarelle %", "solarelle percentage", "coverage %"] },
                { key: "amountPaid", label: "Amount Paid", type: "number", required: false, aliases: ["amount paid", "paid", "patient copay", "copay"] },
                { key: "reference", label: "Reference / Approval No", type: "string", required: false, aliases: ["reference", "ref", "approval no", "claim ref"] },
                { key: "remarks", label: "Remarks", type: "string", required: false, aliases: ["remarks", "notes"] }
            ],
            sampleRows: [
                ["2026-03-01", "Mohamed Ziyad", "A345678", "7912345", "Dr. Sharma", "Rotator Cuff Injury", "450.00", "80", "90.00", "SOL-REF-890", "Approved via portal"],
                ["2026-03-02", "Mariyam Niuma", "A876543", "7987654", "Dr. Alim", "Knee Osteoarthritis", "350.00", "80", "70.00", "SOL-REF-891", "Session 3 of 6"]
            ]
        },
        roster_engine: {
            name: "Grid Roster Engine / Shift Schedules",
            icon: "🗓️",
            description: "Monthly shift allocations (M=Morning, A=Afternoon, OFF, D=Day, E=Evening, etc.)",
            primaryKeyDesc: "Matched by Staff Email / Name and Schedule Dates",
            fields: [
                { key: "staffIdentifier", label: "Staff Name or Email", type: "string", required: true, aliases: ["staff", "staff name", "name", "employee", "email"] },
                { key: "date", label: "Shift Date (or use Matrix sheet)", type: "date", required: true, aliases: ["date", "shift date", "day"] },
                { key: "shiftCode", label: "Shift Code (M, A, OFF, D, E, N, L)", type: "string", required: true, aliases: ["shift", "shift code", "duty", "code"] }
            ],
            sampleRows: [
                ["Adam (adam@physio.mv)", "2026-03-01", "M"],
                ["Adam (adam@physio.mv)", "2026-03-02", "A"],
                ["Sara (sara@physio.mv)", "2026-03-01", "A"],
                ["Sara (sara@physio.mv)", "2026-03-02", "OFF"]
            ],
            supportsMatrix: true // Can import wide matrix sheets where column headers are day numbers or dates
        },
        therapist_attendance: {
            name: "Therapist Attendance & Rate Sheet",
            icon: "⏱️",
            description: "Monthly therapist attendance sessions, 150/200 min counts, OT, and rates.",
            primaryKeyDesc: "Matched by Therapist Name/Email + Month Cycle",
            fields: [
                { key: "therapist", label: "Therapist Name / Email", type: "string", required: true, aliases: ["therapist", "name", "therapist name", "email", "staff"] },
                { key: "month", label: "Month Cycle (YYYY-MM)", type: "string", required: true, aliases: ["month", "cycle", "period", "month cycle"] },
                { key: "rateAtt", label: "Att Rate (MVR)", type: "number", required: false, aliases: ["rate att", "att rate", "attendance rate"] },
                { key: "rate150", label: "150 min Rate (MVR)", type: "number", required: false, aliases: ["rate 150", "150 rate", "rate150"] },
                { key: "rate200", label: "200 min Rate (MVR)", type: "number", required: false, aliases: ["rate 200", "200 rate", "rate200"] },
                { key: "rateOt", label: "OT Rate (MVR)", type: "number", required: false, aliases: ["rate ot", "ot rate", "overtime rate"] }
            ],
            sampleRows: [
                ["Adam", "2026-03", "100", "150", "200", "80"],
                ["Sara", "2026-03", "100", "150", "200", "80"]
            ]
        },
        staff_directory: {
            name: "Personnel Directory (Staff Profiles)",
            icon: "👥",
            description: "Staff profiles, designations, department assignments, styles, and balances.",
            primaryKeyDesc: "Matched by Staff Email or Full Name",
            fields: [
                { key: "name", label: "Full Name", type: "string", required: true, aliases: ["name", "full name", "employee name", "staff name"] },
                { key: "email", label: "Email Address", type: "string", required: true, aliases: ["email", "email address", "mail"] },
                { key: "username", label: "Username", type: "string", required: false, aliases: ["username", "user", "login id"] },
                { key: "position", label: "Position / Designation", type: "string", required: true, aliases: ["position", "designation", "role", "title", "job title"] },
                { key: "department", label: "Department", type: "string", required: false, aliases: ["department", "dept", "unit"] },
                { key: "style", label: "Style (Full-Time / Part-Time)", type: "string", required: false, aliases: ["style", "employment type", "type", "contract type"] },
                { key: "phone", label: "Phone Number", type: "string", required: false, aliases: ["phone", "mobile", "contact", "phone number"] },
                { key: "idCard", label: "National ID Card", type: "string", required: false, aliases: ["id card", "national id", "nid", "id"] },
                { key: "joiningDate", label: "Joining Date", type: "date", required: false, aliases: ["joining date", "hire date", "start date"] },
                { key: "contractExpiryDate", label: "Contract Expiry", type: "date", required: false, aliases: ["contract expiry", "contract expiry date", "expiry"] },
                { key: "sickBalance", label: "Sick Leave Balance", type: "number", required: false, aliases: ["sick balance", "sick leave", "sick days"] },
                { key: "annualBalance", label: "Annual Leave Balance", type: "number", required: false, aliases: ["annual balance", "annual leave", "annual days"] }
            ],
            sampleRows: [
                ["Dr. Hassan Latheef", "hassan@physio.mv", "hassan", "Physiotherapist", "Physiotherapy Department", "Full-Time", "7911122", "A112233", "2024-01-15", "2026-12-31", "30", "30"],
                ["Aminath Shifa", "shifa@physio.mv", "shifa", "Fdo", "Administration Hub", "Full-Time", "7933344", "A445566", "2024-05-01", "2027-04-30", "30", "30"]
            ]
        },
        inventory_supplies: {
            name: "Inventory & Supplies Warehouse",
            icon: "📦",
            description: "Clinical consumables, supply quantities, minimum thresholds, and units.",
            primaryKeyDesc: "Matched by Item Name + Category",
            fields: [
                { key: "name", label: "Item / Supply Name", type: "string", required: true, aliases: ["name", "item", "item name", "supply", "description"] },
                { key: "category", label: "Category", type: "string", required: false, aliases: ["category", "cat", "group", "type"] },
                { key: "date", label: "Stock Date", type: "date", required: false, aliases: ["date", "stock date", "recorded date", "entry date"] },
                { key: "stock", label: "Current Stock Quantity", type: "number", required: true, aliases: ["stock", "quantity", "current stock", "qty", "count"] },
                { key: "minLimit", label: "Min Reorder Threshold", type: "number", required: false, aliases: ["min limit", "min threshold", "reorder level", "threshold", "minimum"] },
                { key: "unit", label: "Unit (Boxes, Packs, Roll, Bottles)", type: "string", required: false, aliases: ["unit", "uom", "package", "packaging"] },
                { key: "visibleTo", label: "Visibility", type: "string", required: false, aliases: ["visibility", "visible to", "access"] }
            ],
            sampleRows: [
                ["Theraband - Resistance Band (Yellow)", "Therapy Equipment", "2026-03-01", "25", "10", "Rolls", "all"],
                ["Ultrasound Gel (5L Container)", "Consumables", "2026-03-01", "12", "4", "Bottles", "all"],
                ["Dry Needles 0.25x40mm", "Clinical Supplies", "2026-03-01", "80", "20", "Boxes", "all"]
            ]
        },
        pricing_ref: {
            name: "Pricing Reference & Patient Fees",
            icon: "🏷️",
            description: "Patient customized pricing, therapist assignments, and appointment schedules.",
            primaryKeyDesc: "Matched by National ID Card or Patient Name + Date",
            fields: [
                { key: "date", label: "Date", type: "date", required: false, aliases: ["date", "entry date", "fee date"] },
                { key: "name", label: "Patient Name", type: "string", required: true, aliases: ["patient name", "name", "full name"] },
                { key: "idCard", label: "National ID Card", type: "string", required: false, aliases: ["id card", "id", "national id", "nid"] },
                { key: "therapist", label: "Assigned Therapist", type: "string", required: false, aliases: ["therapist", "doctor", "assigned staff", "physio"] },
                { key: "price", label: "Price / Rate (MVR)", type: "number", required: true, aliases: ["price", "fee", "rate", "cost", "amount"] },
                { key: "appts", label: "No. of Appointments", type: "number", required: false, aliases: ["appts", "appointments", "sessions", "count"] },
                { key: "remarks", label: "Remarks", type: "string", required: false, aliases: ["remarks", "notes"] },
                { key: "priceSetBy", label: "Price Set By", type: "string", required: false, aliases: ["price set by", "set by", "authorized by"] }
            ],
            sampleRows: [
                ["2026-03-01", "Ali Naeem", "A223344", "Dr. Adam", "450", "12", "Special agreed concession rate", "Admin"],
                ["2026-03-02", "Fathimath Zahira", "A556677", "Dr. Sara", "500", "8", "Standard clinical rehab package", "Admin"]
            ]
        },
        leave_records: {
            name: "Leave & Sick Leave Records",
            icon: "🌴",
            description: "Staff leave submissions, sick leave with MC certificates, and approvals.",
            primaryKeyDesc: "Matched by Employee Name/Email + Date + Leave Type",
            fields: [
                { key: "employee", label: "Employee Name", type: "string", required: true, aliases: ["employee", "employee name", "name", "staff", "staff name"] },
                { key: "email", label: "Employee Email", type: "string", required: false, aliases: ["email", "staff email", "employee email"] },
                { key: "type", label: "Leave Type (Sick Leave, Annual, etc.)", type: "string", required: true, aliases: ["type", "leave type", "category", "leave"] },
                { key: "duration", label: "Duration (Days)", type: "number", required: true, aliases: ["duration", "days", "no of days", "days requested"] },
                { key: "date", label: "Submission Date", type: "date", required: false, aliases: ["date", "submitted date", "entry date"] },
                { key: "fromDate", label: "From Date", type: "date", required: true, aliases: ["from date", "start date", "from", "leave from"] },
                { key: "toDate", label: "To Date", type: "date", required: true, aliases: ["to date", "end date", "to", "leave to"] },
                { key: "mcStatus", label: "MC Attached (Yes/No)", type: "string", required: false, aliases: ["mc status", "mc", "medical certificate", "mc attached"] },
                { key: "status", label: "Status (Approved / Pending)", type: "string", required: false, aliases: ["status", "approval status", "state"] },
                { key: "note", label: "Reason / Notes", type: "string", required: false, aliases: ["note", "reason", "remarks", "notes"] }
            ],
            sampleRows: [
                ["Adam", "adam@physio.mv", "Sick Leave", "2", "2026-03-01", "2026-03-01", "2026-03-02", "Yes", "Approved", "Viral fever with clinic MC certificate"],
                ["Sara", "sara@physio.mv", "Annual Leave", "5", "2026-03-05", "2026-03-10", "2026-03-14", "No", "Approved", "Family vacation trip"]
            ]
        },
        sequential_id: {
            name: "Document Reference Generator",
            icon: "🔢",
            description: "Sequential ID reference codes, letters, agreements, and memorandums.",
            primaryKeyDesc: "Matched by Sequential Ref ID or Recipient + Date",
            fields: [
                { key: "date", label: "Date", type: "date", required: true, aliases: ["date", "issue date", "generated date"] },
                { key: "refId", label: "Reference ID (e.g. PS/P-001/2026)", type: "string", required: false, aliases: ["ref id", "reference id", "code", "seq id", "id"] },
                { key: "type", label: "Type (P: Policy, A: Agreement, M: Memo)", type: "string", required: true, aliases: ["type", "doc type", "document type", "category"] },
                { key: "holder", label: "Holder / Recipient Name", type: "string", required: true, aliases: ["holder", "recipient", "issued to", "name", "client"] },
                { key: "remarks", label: "Remarks / Purpose", type: "string", required: false, aliases: ["remarks", "purpose", "subject", "notes", "description"] }
            ],
            sampleRows: [
                ["2026-03-01", "PS/P-001/2026", "P", "Ministry of Health", "Clinical protocol endorsement"],
                ["2026-03-02", "PS/A-001/2026", "A", "Solarelle Insurance Pvt Ltd", "Healthcare service provider agreement renewal"]
            ]
        }
    };

    // State Variables for Importer Session
    let activeParsedData = {
        moduleKey: "fdo_sheets",
        fileName: "",
        sheetNames: [],
        selectedSheet: "",
        rawHeaders: [],
        rawRows: [],
        columnMapping: {}, // targetKey -> rawHeaderIndex
        combineMode: "merge", // "merge", "append", "replace"
        matrixCycleYear: new Date().getFullYear(),
        matrixCycleMonth: String(new Date().getMonth() + 1).padStart(2, '0')
    };

    // Helper: Normalize Date strings cleanly to ISO YYYY-MM-DD
    function normalizeDate(val) {
        if (!val && val !== 0) return '';
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return '';
            const y = val.getFullYear();
            const m = String(val.getMonth() + 1).padStart(2, '0');
            const d = String(val.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        // Handle Excel numeric serial dates (e.g., 45350)
        if (typeof val === 'number') {
            const utcDays = Math.floor(val - 25569);
            const utcValue = utcDays * 86400;
            const dateInfo = new Date(utcValue * 1000);
            if (!isNaN(dateInfo.getTime())) {
                const y = dateInfo.getUTCFullYear();
                const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
                const d = String(dateInfo.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
        }
        const s = String(val).trim();
        if (!s) return '';

        // Already ISO YYYY-MM-DD
        if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
            const parts = s.split('T')[0].split('-');
            return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
        }

        // DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY
        const dmyMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
        if (dmyMatch) {
            let d = parseInt(dmyMatch[1], 10);
            let m = parseInt(dmyMatch[2], 10);
            let y = parseInt(dmyMatch[3], 10);
            if (m > 12 && d <= 12) {
                // Was likely MM/DD/YYYY
                const tmp = d; d = m; m = tmp;
            }
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }

        // Parse date strings like "15-Mar-2026" or "March 15, 2026"
        const parsed = Date.parse(s);
        if (!isNaN(parsed)) {
            const dObj = new Date(parsed);
            const y = dObj.getFullYear();
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const d = String(dObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        return s;
    }

    // Helper: Normalize Name strings for robust comparison
    function normalizeName(str) {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms)\s+/i, '')
            .replace(/\s+/g, ' ');
    }

    // Auto-Detect best matching column based on schema aliases
    function autoDetectColumnMapping(moduleKey, rawHeaders) {
        const schema = IMPORTER_MODULES[moduleKey];
        if (!schema) return {};

        const mapping = {};
        const usedIndices = new Set();

        schema.fields.forEach(field => {
            let bestIndex = -1;
            let bestScore = 0;

            rawHeaders.forEach((header, idx) => {
                if (usedIndices.has(idx)) return;
                const hNorm = String(header).trim().toLowerCase();

                // Exact match with field key or label
                if (hNorm === field.key.toLowerCase() || hNorm === field.label.toLowerCase()) {
                    bestIndex = idx;
                    bestScore = 100;
                    return;
                }

                // Check defined aliases
                for (const alias of field.aliases) {
                    const aNorm = alias.toLowerCase();
                    if (hNorm === aNorm) {
                        if (bestScore < 95) { bestIndex = idx; bestScore = 95; }
                    } else if (hNorm.includes(aNorm) || aNorm.includes(hNorm)) {
                        if (bestScore < 70) { bestIndex = idx; bestScore = 70; }
                    }
                }
            });

            if (bestIndex !== -1) {
                mapping[field.key] = bestIndex;
                usedIndices.add(bestIndex);
            } else {
                mapping[field.key] = -1; // Unmapped
            }
        });

        return mapping;
    }

    // Parse Sheet data into rows using SheetJS
    function parseWorkbook(workbook, moduleKey, fileName) {
        const sheetNames = workbook.SheetNames;
        if (!sheetNames || sheetNames.length === 0) {
            throw new Error("No sheets found in the uploaded workbook.");
        }

        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays (AOA)
        const rawAoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!rawAoa || rawAoa.length < 2) {
            throw new Error("The uploaded sheet contains no data rows.");
        }

        // Clean headers
        const rawHeaders = rawAoa[0].map(h => String(h || "").trim());
        const rawRows = rawAoa.slice(1).filter(r => r.some(c => c !== null && c !== undefined && String(c).trim() !== ""));

        activeParsedData.moduleKey = moduleKey;
        activeParsedData.fileName = fileName;
        activeParsedData.sheetNames = sheetNames;
        activeParsedData.selectedSheet = firstSheetName;
        activeParsedData.rawHeaders = rawHeaders;
        activeParsedData.rawRows = rawRows;
        activeParsedData.columnMapping = autoDetectColumnMapping(moduleKey, rawHeaders);

        return activeParsedData;
    }

    // Parse CSV or TSV raw string
    function parseCsvString(csvText, moduleKey, fileName = "Pasted_Data.csv") {
        const workbook = XLSX.read(csvText, { type: 'string' });
        return parseWorkbook(workbook, moduleKey, fileName);
    }

    // Parse Binary / ArrayBuffer
    function parseFileBuffer(buffer, moduleKey, fileName) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        return parseWorkbook(workbook, moduleKey, fileName);
    }

    // Generate and download a sample Excel template for the given module
    window.downloadModuleImportTemplate = function (moduleKey) {
        const schema = IMPORTER_MODULES[moduleKey];
        if (!schema) return;

        const headers = schema.fields.map(f => f.label);
        const sampleData = [headers, ...schema.sampleRows];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sampleData);

        // Adjust column widths automatically
        ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));

        XLSX.utils.book_append_sheet(wb, ws, "Import_Template");
        const outFileName = `Template_${moduleKey}_Import.xlsx`;
        XLSX.writeFile(wb, outFileName);
    };

    // Roster Matrix Detection & Extraction
    function isRosterMatrixFormat(headers) {
        // If multiple headers look like day numbers (1..31) or ISO dates, it's a matrix
        let dateOrDayHeaders = 0;
        headers.forEach(h => {
            const trimmed = String(h).trim();
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1 && num <= 31) dateOrDayHeaders++;
            if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed) || /^\d{1,2}[\/\.-]\d{1,2}/.test(trimmed)) dateOrDayHeaders++;
        });
        return dateOrDayHeaders >= 5;
    }

    // Core MERGE & COMBINE Engines for Each Module
    const MERGE_HANDLERS = {
        // 1. FDO SHEETS
        fdo_sheets: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof fdoSheetData === 'undefined') window.fdoSheetData = [];

            if (mode === "replace") {
                window.fdoSheetData = [];
                window.fdoRowCounter = 0;
            }

            rows.forEach(item => {
                const date = normalizeDate(item.date);
                if (!date) return;

                const aasandha = String(item.aasandha || '0.00');
                const newSoftware = String(item.newSoftware || '0.00');
                const diff = (parseFloat(newSoftware || 0) - parseFloat(aasandha || 0)).toFixed(2);
                const remarks = String(item.remarks || '');
                const filledBy = String(item.filledBy || (typeof currentActiveSessionUser !== 'undefined' && currentActiveSessionUser ? currentActiveSessionUser.name : ''));

                let existing = null;
                if (mode === "merge") {
                    existing = window.fdoSheetData.find(r => r.date === date);
                }

                if (existing) {
                    if (item.aasandha !== undefined) existing.aasandha = aasandha;
                    if (item.newSoftware !== undefined) existing.newSoftware = newSoftware;
                    existing.difference = diff;
                    if (remarks) existing.remarks = (existing.remarks ? existing.remarks + " | " : "") + remarks;
                    if (filledBy) existing.filledBy = filledBy;
                    existing.revisedDate = new Date().toISOString().slice(0, 10);
                    existing.revisedBy = "Universal Importer";
                    updated++;
                } else {
                    window.fdoRowCounter = (window.fdoRowCounter || 0) + 1;
                    window.fdoSheetData.push({
                        id: `fdo_row_${window.fdoRowCounter}`,
                        date: date,
                        aasandha: aasandha,
                        newSoftware: newSoftware,
                        difference: diff,
                        remarks: remarks,
                        filledBy: filledBy,
                        revisedDate: '',
                        revisedBy: ''
                    });
                    added++;
                }
            });

            if (typeof saveFdoSheetData === 'function') saveFdoSheetData();
            if (typeof renderFdoTable === 'function') renderFdoTable();
            return { updated, added, total: window.fdoSheetData.length };
        },

        // 2. PATIENT TRACKER
        patient_tracker: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof patientTrackerData === 'undefined') window.patientTrackerData = [];
            if (typeof patientRepository === 'undefined') window.patientRepository = {};

            if (mode === "replace") {
                window.patientTrackerData = [];
                window.patientTrackerRowCounter = 0;
            }

            rows.forEach(item => {
                const patientName = String(item.patientName || '').trim();
                if (!patientName) return;

                const entryDate = normalizeDate(item.entryDate) || new Date().toISOString().slice(0, 10);
                const idCard = String(item.idCard || '').trim();
                const memoNo = String(item.memoNo || '').trim();
                const rxDate = normalizeDate(item.prescriptionDate);
                const rxExpiry = normalizeDate(item.prescriptionExpires) || (rxDate ? calcDefaultExpiry(rxDate) : '');
                const sessions = String(item.sessions || '12');
                const sessionsGiven = String(item.sessionsGiven || '0');
                const diagnosis = String(item.diagnosis || '');
                const consultDate = normalizeDate(item.consultDate);
                const renewedSessions = String(item.renewedSessions || '0');
                const status = String(item.status || 'Active');
                const remarks = String(item.remarks || '');

                let existing = null;
                if (mode === "merge") {
                    existing = window.patientTrackerData.find(r => {
                        if (idCard && r.idCard && idCard.toLowerCase() === r.idCard.toLowerCase()) return true;
                        if (memoNo && r.memoNo && memoNo.toLowerCase() === r.memoNo.toLowerCase()) return true;
                        return normalizeName(r.patientName) === normalizeName(patientName) && r.entryDate === entryDate;
                    });
                }

                if (existing) {
                    if (memoNo) existing.memoNo = memoNo;
                    if (idCard) existing.idCard = idCard;
                    if (rxDate) existing.prescriptionDate = rxDate;
                    if (rxExpiry) existing.prescriptionExpires = rxExpiry;
                    if (item.sessions) existing.sessions = sessions;
                    if (item.sessionsGiven) existing.sessionsGiven = sessionsGiven;
                    if (diagnosis) existing.diagnosis = diagnosis;
                    if (consultDate) existing.consultDate = consultDate;
                    if (item.renewedSessions) existing.renewedSessions = renewedSessions;
                    if (status) existing.status = status;
                    if (remarks) existing.remarks = (existing.remarks ? existing.remarks + " | " : "") + remarks;
                    updated++;
                } else {
                    window.patientTrackerRowCounter = (window.patientTrackerRowCounter || 0) + 1;
                    window.patientTrackerData.push({
                        id: `pt_row_${window.patientTrackerRowCounter}`,
                        entryDate: entryDate,
                        memoNo: memoNo,
                        patientName: patientName,
                        idCard: idCard,
                        prescriptionDate: rxDate,
                        prescriptionExpires: rxExpiry,
                        sessions: sessions,
                        sessionsGiven: sessionsGiven,
                        diagnosis: diagnosis,
                        consultDate: consultDate,
                        renewedSessions: renewedSessions,
                        status: status,
                        remarks: remarks
                    });
                    added++;
                }

                // Sync with patientRepository index
                if (idCard) {
                    window.patientRepository[idCard] = {
                        name: patientName,
                        sessions: sessions,
                        lastSeen: entryDate,
                        diagnosis: diagnosis
                    };
                }
            });

            if (typeof savePatientTrackerData === 'function') savePatientTrackerData();
            if (typeof savePatientRepository === 'function') savePatientRepository();
            if (typeof ptRefreshTable === 'function') ptRefreshTable();
            return { updated, added, total: window.patientTrackerData.length };
        },

        // 3. SOLARELLE PATIENTS
        solarelle_patients: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof solarelleData === 'undefined') window.solarelleData = [];

            if (mode === "replace") {
                window.solarelleData = [];
            }

            rows.forEach(item => {
                const patientName = String(item.patientName || '').trim();
                const totalAmount = parseFloat(item.totalAmount) || 0;
                const date = normalizeDate(item.date) || new Date().toISOString().slice(0, 10);
                const idCard = String(item.idCard || '').trim();

                let existing = null;
                if (mode === "merge") {
                    existing = window.solarelleData.find(r => {
                        if (idCard && r.idCard && idCard.toLowerCase() === r.idCard.toLowerCase() && r.date === date) return true;
                        return normalizeName(r.patientName) === normalizeName(patientName) && r.date === date;
                    });
                }

                const solPct = parseFloat(item.solarellePercent) || 80;
                const paid = parseFloat(item.amountPaid) || 0;
                const solAmt = totalAmount * (solPct / 100);
                const aasandhaAmt = totalAmount - solAmt - paid;

                if (existing) {
                    if (patientName) existing.patientName = patientName;
                    if (idCard) existing.idCard = idCard;
                    if (item.contact) existing.contact = String(item.contact);
                    if (item.doctor) existing.doctor = String(item.doctor);
                    if (item.diagnosis) existing.diagnosis = String(item.diagnosis);
                    if (totalAmount) existing.totalAmount = totalAmount;
                    if (item.solarellePercent) existing.solarellePercent = solPct;
                    existing.solarelleAmount = solAmt;
                    existing.amountPaid = paid;
                    existing.aasandhaAmount = aasandhaAmt;
                    if (item.reference) existing.reference = String(item.reference);
                    if (item.remarks) existing.remarks = (existing.remarks ? existing.remarks + " | " : "") + String(item.remarks);
                    updated++;
                } else {
                    window.solarelleData.push({
                        id: `sol_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                        date: date,
                        patientName: patientName,
                        idCard: idCard,
                        contact: String(item.contact || ''),
                        doctor: String(item.doctor || ''),
                        diagnosis: String(item.diagnosis || ''),
                        totalAmount: totalAmount,
                        solarellePercent: solPct,
                        solarelleAmount: solAmt,
                        amountPaid: paid,
                        aasandhaAmount: aasandhaAmt,
                        reference: String(item.reference || ''),
                        remarks: String(item.remarks || '')
                    });
                    added++;
                }

                if (idCard && typeof solarelleRememberIdName === 'function') {
                    solarelleRememberIdName(idCard, patientName, solPct);
                }
            });

            if (typeof saveSolarelleData === 'function') saveSolarelleData();
            if (typeof renderSolarelleTable === 'function') renderSolarelleTable();
            return { updated, added, total: window.solarelleData.length };
        },

        // 4. GRID ROSTER ENGINE
        roster_engine: function (rows, mode, options) {
            let updated = 0, added = 0;
            if (typeof activeCompiledShiftSchedules === 'undefined') window.activeCompiledShiftSchedules = {};
            if (typeof globalRosterRepository === 'undefined') window.globalRosterRepository = [];

            if (mode === "replace") {
                window.activeCompiledShiftSchedules = {};
            }

            // Check if this was a matrix import (staff rows with date columns)
            if (options && options.isMatrix) {
                const year = options.year || new Date().getFullYear();
                const month = String(options.month || (new Date().getMonth() + 1)).padStart(2, '0');

                options.matrixData.forEach(mRow => {
                    const staffId = mRow.staffIdentifier;
                    const staffUser = findStaffMatch(staffId);
                    if (!staffUser) return;

                    const email = staffUser.email;
                    if (!window.activeCompiledShiftSchedules[email]) {
                        window.activeCompiledShiftSchedules[email] = {};
                    }

                    mRow.shifts.forEach(({ dateKey, shiftCode }) => {
                        const cleanShift = String(shiftCode || 'OFF').toUpperCase().trim();
                        if (cleanShift) {
                            window.activeCompiledShiftSchedules[email][dateKey] = cleanShift;
                            updated++;
                        }
                    });
                });
            } else {
                // Flat rows import
                rows.forEach(item => {
                    const staffId = String(item.staffIdentifier || '').trim();
                    const staffUser = findStaffMatch(staffId);
                    if (!staffUser) return;

                    const date = normalizeDate(item.date);
                    if (!date) return;

                    const shift = String(item.shiftCode || 'OFF').toUpperCase().trim();
                    const email = staffUser.email;

                    if (!window.activeCompiledShiftSchedules[email]) {
                        window.activeCompiledShiftSchedules[email] = {};
                    }

                    const existing = window.activeCompiledShiftSchedules[email][date];
                    window.activeCompiledShiftSchedules[email][date] = shift;
                    if (existing) updated++; else added++;
                });
            }

            // Persist schedules
            try {
                localStorage.setItem('physioCompiledShiftSchedules', JSON.stringify(window.activeCompiledShiftSchedules));
            } catch (e) { }

            if (typeof rebuildSystemRosterGridSkeleton === 'function') rebuildSystemRosterGridSkeleton();
            if (typeof renderAdvancedRosterSpreadsheet === 'function') renderAdvancedRosterSpreadsheet();
            if (typeof synchronizeWorkspaceCoreStatus === 'function') synchronizeWorkspaceCoreStatus();

            return { updated, added, total: Object.keys(window.activeCompiledShiftSchedules).length };
        },

        // 5. THERAPIST ATTENDANCE
        therapist_attendance: function (rows, mode) {
            let updated = 0, added = 0;
            rows.forEach(item => {
                const staffId = String(item.therapist || '').trim();
                const staffUser = findStaffMatch(staffId);
                if (!staffUser) return;

                const month = String(item.month || '').trim() || new Date().toISOString().slice(0, 7);
                const email = staffUser.email;

                if (typeof saveTherapistAttRate === 'function') {
                    if (item.rateAtt !== undefined) saveTherapistAttRate(email, month, 'att', item.rateAtt);
                    if (item.rate150 !== undefined) saveTherapistAttRate(email, month, '150', item.rate150);
                    if (item.rate200 !== undefined) saveTherapistAttRate(email, month, '200', item.rate200);
                    if (item.rateOt !== undefined) saveTherapistAttRate(email, month, 'ot', item.rateOt);
                    updated++;
                }
            });

            if (typeof renderTherapistAttendanceSheet === 'function') renderTherapistAttendanceSheet();
            return { updated, added, total: rows.length };
        },

        // 6. PERSONNEL DIRECTORY (STAFF)
        staff_directory: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof globalRosterRepository === 'undefined') window.globalRosterRepository = [];

            if (mode === "replace") {
                // Keep active admin to prevent lock out
                const adminUser = window.globalRosterRepository.find(u => u.position === "Admin");
                window.globalRosterRepository = adminUser ? [adminUser] : [];
            }

            rows.forEach(item => {
                const name = String(item.name || '').trim();
                const email = String(item.email || '').trim().toLowerCase();
                if (!name && !email) return;

                const username = String(item.username || (email ? email.split('@')[0] : name.toLowerCase().replace(/\s+/g, '.')));
                const pos = String(item.position || 'Physiotherapist');
                const dept = String(item.department || (pos.toLowerCase().includes('physio') ? 'Physiotherapy Department' : 'Administration Hub'));
                const style = String(item.style || 'Full-Time');

                let existing = null;
                if (mode === "merge") {
                    existing = window.globalRosterRepository.find(u => {
                        if (email && u.email && u.email.toLowerCase() === email) return true;
                        return normalizeName(u.name) === normalizeName(name);
                    });
                }

                if (existing) {
                    if (name) existing.name = name;
                    if (pos) existing.position = pos;
                    if (dept) existing.department = dept;
                    if (style) existing.style = style;
                    if (item.phone) existing.phone = String(item.phone);
                    if (item.idCard) existing.idCard = String(item.idCard);
                    if (item.joiningDate) existing.joiningDate = normalizeDate(item.joiningDate);
                    if (item.contractExpiryDate) existing.contractExpiryDate = normalizeDate(item.contractExpiryDate);
                    if (item.sickBalance !== undefined) existing.sickBalance = parseFloat(item.sickBalance) || 30;
                    if (item.annualBalance !== undefined) existing.annualBalance = parseFloat(item.annualBalance) || 30;
                    updated++;
                } else {
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || "ST";
                    window.globalRosterRepository.push({
                        name: name,
                        username: username,
                        email: email || `${username}@physio.mv`,
                        position: pos,
                        style: style,
                        department: dept,
                        avatar: initials,
                        password: "Password123!",
                        dob: normalizeDate(item.dob) || "",
                        phone: String(item.phone || ""),
                        emergencyContact: String(item.emergencyContact || ""),
                        idCard: String(item.idCard || ""),
                        idCardExpiry: normalizeDate(item.idCardExpiry) || "",
                        healthLicence: String(item.healthLicence || ""),
                        healthLicenceExpiry: normalizeDate(item.healthLicenceExpiry) || "",
                        visaExpiry: normalizeDate(item.visaExpiry) || "",
                        passportExpiry: normalizeDate(item.passportExpiry) || "",
                        accentColor: "#004b87",
                        hireDate: normalizeDate(item.joiningDate) || new Date().toISOString().split('T')[0],
                        sickBalance: parseFloat(item.sickBalance) || (style === "Full-Time" ? 30 : 0),
                        annualBalance: parseFloat(item.annualBalance) || (style === "Full-Time" ? 30 : 0),
                        familyBalance: 15,
                        umrahBalance: 15,
                        hajjBalance: 15,
                        noPaidBalance: 15,
                        maternityBalance: 90,
                        paternityBalance: 10,
                        specialBalance: 15,
                        lastLeaveReset: normalizeDate(item.joiningDate) || new Date().toISOString().split('T')[0],
                        photoUrl: "",
                        extraFieldsData: {},
                        joiningDate: normalizeDate(item.joiningDate) || new Date().toISOString().split('T')[0],
                        contractExpiryDate: normalizeDate(item.contractExpiryDate) || "",
                        lastDayOfWorking: "",
                        quotaActive: false,
                        quotaNumber: "",
                        quotaExpiry: ""
                    });
                    added++;
                }
            });

            try {
                localStorage.setItem('physioStaffDirectoryRepository', JSON.stringify(window.globalRosterRepository));
            } catch (e) { }

            if (typeof renderPersonnelStaffDirectory === 'function') renderPersonnelStaffDirectory();
            if (typeof synchronizeWorkspaceCoreStatus === 'function') synchronizeWorkspaceCoreStatus();
            return { updated, added, total: window.globalRosterRepository.length };
        },

        // 7. INVENTORY & SUPPLIES
        inventory_supplies: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof inventoryRepository === 'undefined') window.inventoryRepository = [];

            if (mode === "replace") {
                window.inventoryRepository = [];
            }

            rows.forEach(item => {
                const name = String(item.name || '').trim();
                if (!name) return;

                const cat = String(item.category || 'Clinical Consumables').trim();
                const stock = parseInt(item.stock, 10) || 0;
                const minLimit = parseInt(item.minLimit, 10) || 5;
                const unit = String(item.unit || 'Units').trim();
                const date = normalizeDate(item.date) || new Date().toISOString().split('T')[0];
                const visibleTo = String(item.visibleTo || 'all').trim();

                let existing = null;
                if (mode === "merge") {
                    existing = window.inventoryRepository.find(i =>
                        i.name.trim().toLowerCase() === name.toLowerCase() &&
                        (!cat || i.category.trim().toLowerCase() === cat.toLowerCase())
                    );
                }

                if (existing) {
                    existing.stock = stock;
                    if (item.minLimit !== undefined) existing.minLimit = minLimit;
                    if (unit) existing.unit = unit;
                    if (date) existing.date = date;
                    if (visibleTo) existing.visibleTo = visibleTo;
                    updated++;
                } else {
                    window.inventoryRepository.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        name: name,
                        category: cat,
                        date: date,
                        stock: stock,
                        minLimit: minLimit,
                        unit: unit,
                        pinned: false,
                        visibleTo: visibleTo
                    });
                    added++;
                }
            });

            if (typeof saveInventoryRepository === 'function') saveInventoryRepository();
            if (typeof renderInventorySuppliesWarehouseHub === 'function') renderInventorySuppliesWarehouseHub();
            if (typeof renderInventoryItems === 'function') renderInventoryItems();
            return { updated, added, total: window.inventoryRepository.length };
        },

        // 8. PRICING REFERENCE
        pricing_ref: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof pricingRefData === 'undefined') window.pricingRefData = [];

            if (mode === "replace") {
                window.pricingRefData = [];
                window.pricingRowIdCounter = 0;
            }

            rows.forEach(item => {
                const name = String(item.name || '').trim();
                if (!name) return;

                const date = normalizeDate(item.date) || new Date().toISOString().split('T')[0];
                const idCard = String(item.idCard || '').trim();
                const therapist = String(item.therapist || '').trim();
                const price = parseFloat(item.price) || 0;
                const appts = parseInt(item.appts, 10) || 1;
                const remarks = String(item.remarks || '');
                const priceSetBy = String(item.priceSetBy || (typeof currentActiveSessionUser !== 'undefined' && currentActiveSessionUser ? currentActiveSessionUser.name : 'Admin'));

                let existing = null;
                if (mode === "merge") {
                    existing = window.pricingRefData.find(r => {
                        if (idCard && r.idCard && idCard.toLowerCase() === r.idCard.toLowerCase()) return true;
                        return normalizeName(r.name) === normalizeName(name) && r.date === date;
                    });
                }

                if (existing) {
                    existing.price = price;
                    if (item.appts !== undefined) existing.appts = appts;
                    if (therapist) existing.therapist = therapist;
                    if (remarks) existing.remarks = (existing.remarks ? existing.remarks + " | " : "") + remarks;
                    existing.lastModifiedBy = "Universal Importer";
                    updated++;
                } else {
                    window.pricingRowIdCounter = (window.pricingRowIdCounter || 0) + 1;
                    window.pricingRefData.push({
                        id: window.pricingRowIdCounter,
                        date: date,
                        name: name,
                        idCard: idCard,
                        therapist: therapist,
                        price: price,
                        appts: appts,
                        remarks: remarks,
                        ongoing: true,
                        discharged: false,
                        priceSetBy: priceSetBy,
                        lastModifiedBy: "Universal Importer"
                    });
                    added++;
                }
            });

            if (typeof savePricingRefData === 'function') savePricingRefData();
            if (typeof renderPricingRefTable === 'function') renderPricingRefTable();
            return { updated, added, total: window.pricingRefData.length };
        },

        // 9. LEAVE RECORDS
        leave_records: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof globalLeaveRepository === 'undefined') window.globalLeaveRepository = [];

            if (mode === "replace") {
                window.globalLeaveRepository = [];
            }

            rows.forEach(item => {
                const employee = String(item.employee || '').trim();
                const type = String(item.type || 'Sick Leave').trim();
                const fromDate = normalizeDate(item.fromDate) || normalizeDate(item.date);
                const toDate = normalizeDate(item.toDate) || fromDate;
                if (!employee || !fromDate) return;

                const email = String(item.email || '').toLowerCase() || (findStaffMatch(employee)?.email || '');
                const duration = parseFloat(item.duration) || 1;
                const status = String(item.status || 'Approved');
                const mcStatus = String(item.mcStatus || 'No');
                const note = String(item.note || 'Bulk imported record');

                let existing = null;
                if (mode === "merge") {
                    existing = window.globalLeaveRepository.find(l =>
                        (normalizeName(l.employee) === normalizeName(employee) || (email && l.email === email)) &&
                        l.fromDate === fromDate &&
                        l.type.toLowerCase() === type.toLowerCase()
                    );
                }

                if (existing) {
                    existing.duration = duration;
                    existing.toDate = toDate;
                    existing.status = status;
                    existing.mcStatus = mcStatus;
                    if (note) existing.note = note;
                    updated++;
                } else {
                    window.globalLeaveRepository.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        email: email,
                        employee: employee,
                        type: type,
                        duration: duration,
                        date: normalizeDate(item.date) || fromDate,
                        fromDate: fromDate,
                        toDate: toDate,
                        mcStatus: mcStatus,
                        note: note,
                        status: status,
                        submittedAt: new Date().toISOString(),
                        approvedBy: "Universal Importer"
                    });
                    added++;
                }
            });

            try {
                localStorage.setItem('physioGlobalLeaveRepository', JSON.stringify(window.globalLeaveRepository));
            } catch (e) { }

            if (typeof renderActiveLeaveSidebarTracker === 'function') renderActiveLeaveSidebarTracker();
            if (typeof renderLeaveManagementCenter === 'function') renderLeaveManagementCenter();
            if (typeof synchronizeWorkspaceCoreStatus === 'function') synchronizeWorkspaceCoreStatus();

            return { updated, added, total: window.globalLeaveRepository.length };
        },

        // 10. DOCUMENT REFERENCE GENERATOR (SEQUENTIAL ID)
        sequential_id: function (rows, mode) {
            let updated = 0, added = 0;
            if (typeof referenceRepository === 'undefined') window.referenceRepository = [];

            if (mode === "replace") {
                window.referenceRepository = [];
            }

            rows.forEach(item => {
                const holder = String(item.holder || '').trim();
                const type = String(item.type || 'P').toUpperCase().trim();
                const date = normalizeDate(item.date) || new Date().toISOString().split('T')[0];
                if (!holder) return;

                let refId = String(item.refId || '').trim();
                if (!refId && typeof getNextSequenceNumber === 'function') {
                    const year = date.split('-')[0] || String(new Date().getFullYear());
                    const seq = getNextSequenceNumber(type, year);
                    refId = `PS/${type}-${String(seq).padStart(3, '0')}/${year}`;
                }

                let existing = null;
                if (mode === "merge") {
                    existing = window.referenceRepository.find(r =>
                        (refId && r.refId === refId) ||
                        (normalizeName(r.holder) === normalizeName(holder) && r.date === date && r.type === type)
                    );
                }

                if (existing) {
                    if (item.remarks) existing.remarks = (existing.remarks ? existing.remarks + " | " : "") + String(item.remarks);
                    updated++;
                } else {
                    window.referenceRepository.push({
                        date: date,
                        refId: refId || `PS/${type}-000/${date.split('-')[0]}`,
                        type: type,
                        holder: holder,
                        remarks: String(item.remarks || '')
                    });
                    added++;
                }
            });

            try {
                localStorage.setItem('physioReferenceRepository', JSON.stringify(window.referenceRepository));
            } catch (e) { }

            if (typeof renderDocumentRegistryTracker === 'function') renderDocumentRegistryTracker();
            if (typeof synchronizeWorkspaceCoreStatus === 'function') synchronizeWorkspaceCoreStatus();

            return { updated, added, total: window.referenceRepository.length };
        }
    };

    // Helper: Find matching staff in globalRosterRepository by name or email
    function findStaffMatch(identifier) {
        if (!identifier || typeof globalRosterRepository === 'undefined' || !globalRosterRepository) return null;
        const norm = normalizeName(identifier);
        const lower = String(identifier).trim().toLowerCase();

        // 1. Direct email match
        let found = globalRosterRepository.find(u => u.email && u.email.toLowerCase() === lower);
        if (found) return found;

        // 2. Normalized name match
        found = globalRosterRepository.find(u => normalizeName(u.name) === norm);
        if (found) return found;

        // 3. Username match
        found = globalRosterRepository.find(u => u.username && u.username.toLowerCase() === lower);
        if (found) return found;

        // 4. Name contains or starts with
        found = globalRosterRepository.find(u => {
            const uNorm = normalizeName(u.name);
            return uNorm.includes(norm) || norm.includes(uNorm);
        });

        return found || null;
    }

    // Calculate default 4-month prescription expiry
    function calcDefaultExpiry(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            d.setMonth(d.getMonth() + 4);
            return d.toISOString().slice(0, 10);
        } catch (e) {
            return '';
        }
    }

    // ==========================================
    // UI RENDERING & EVENT CONTROLLERS
    // ==========================================

    // Build the Importer UI HTML string
    function buildImporterUI(containerId, initialModule = "fdo_sheets") {
        const schemaKeys = Object.keys(IMPORTER_MODULES);
        const currentSchema = IMPORTER_MODULES[initialModule] || IMPORTER_MODULES.fdo_sheets;

        return `
        <div class="universal-importer-container" style="background:var(--bg-main); border-radius:12px; padding:18px; border:1px solid var(--border); box-shadow:0 4px 20px rgba(0,0,0,0.04);">
            <!-- TOP BAR -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:14px;">
                <div>
                    <h3 style="margin:0 0 4px 0; font-size:16px; font-weight:800; color:var(--text-body); display:flex; align-items:center; gap:8px;">
                        <span>📤 Universal Sheet & Data Importer</span>
                        <span style="font-size:10px; font-weight:700; background:var(--primary); color:#fff; padding:2px 8px; border-radius:20px;">MULTI-MODULE ENGINE</span>
                    </h3>
                    <p style="margin:0; font-size:11px; color:var(--text-muted);">
                        Select any operational module, upload or paste your Excel/CSV sheet, and automatically combine and synchronize records.
                    </p>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="action-btn" style="background:var(--bg-card); color:var(--text-body); border:1px solid var(--border); font-size:11px; padding:6px 12px;" onclick="window.downloadCurrentTemplate()">
                        📥 Download Blank Template (.xlsx)
                    </button>
                </div>
            </div>

            <!-- CONFIGURATION CONTROLS -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:16px; background:var(--bg-inner); border:1px solid var(--border); border-radius:10px; padding:14px;">
                <!-- Target Module Selection -->
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">
                        1. Target Destination Module
                    </label>
                    <select id="uImpModuleSelect" onchange="window.handleImporterModuleChange(this.value)" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-main); color:var(--text-body); font-size:12px; font-weight:700;">
                        ${schemaKeys.map(k => `
                            <option value="${k}" ${k === initialModule ? 'selected' : ''}>
                                ${IMPORTER_MODULES[k].icon} ${IMPORTER_MODULES[k].name}
                            </option>
                        `).join('')}
                    </select>
                    <div id="uImpModuleHint" style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                        ${currentSchema.primaryKeyDesc}
                    </div>
                </div>

                <!-- Combine Strategy Mode -->
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">
                        2. Combine & Merge Strategy
                    </label>
                    <select id="uImpCombineMode" onchange="window.handleImporterModeChange(this.value)" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-main); color:var(--text-body); font-size:12px; font-weight:700;">
                        <option value="merge" selected>🔄 Merge & Update Existing (Append New Records)</option>
                        <option value="append">➕ Append Only (Add All Rows as New)</option>
                        <option value="replace">⚠️ Replace Module Data (Clear & Re-import)</option>
                    </select>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                        Safely matches records by name & date to prevent duplicate collisions.
                    </div>
                </div>

                <!-- Roster Cycle (Visible for Roster Matrix) -->
                <div class="form-group" id="uImpRosterCycleWrap" style="margin-bottom:0; display:${initialModule === 'roster_engine' ? 'block' : 'none'};">
                    <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">
                        Roster Schedule Month
                    </label>
                    <input type="month" id="uImpRosterMonth" value="${new Date().toISOString().slice(0, 7)}" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-main); color:var(--text-body); font-size:12px; font-weight:700;">
                    <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                        Applies to wide matrix shift sheets with day number columns (1-31).
                    </div>
                </div>
            </div>

            <!-- FILE UPLOAD & DROPZONE -->
            <div id="uImpDropzone" style="border:2px dashed var(--border); border-radius:10px; padding:24px; text-align:center; background:var(--bg-card); cursor:pointer; transition:all 0.2s ease; margin-bottom:16px;">
                <div style="font-size:32px; margin-bottom:6px;">📁</div>
                <div style="font-size:13px; font-weight:700; color:var(--text-body); margin-bottom:4px;">
                    Drop your spreadsheet (.xlsx, .xls, .csv) here or click to browse
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">
                    Supports Excel spreadsheets, exports from Google Sheets, CSV files, or reception logs.
                </div>
                <input type="file" id="uImpFileInput" accept=".xlsx,.xls,.csv" style="display:none;" onchange="window.handleFileSelect(event)">
                <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <button class="action-btn" style="background:var(--primary); font-size:11px; padding:6px 14px;" onclick="document.getElementById('uImpFileInput').click(); event.stopPropagation();">
                        📂 Choose File
                    </button>
                    <button class="action-btn" style="background:var(--bg-inner); color:var(--text-body); border:1px solid var(--border); font-size:11px; padding:6px 14px;" onclick="window.togglePasteArea(); event.stopPropagation();">
                        📋 Paste Table / CSV
                    </button>
                </div>
            </div>

            <!-- PASTE TEXTAREA AREA (TOGGLEABLE) -->
            <div id="uImpPasteWrap" style="display:none; margin-bottom:16px; background:var(--bg-inner); border:1px solid var(--border); border-radius:10px; padding:14px;">
                <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">
                    Paste Copied Spreadsheet Rows (TSV / CSV)
                </label>
                <textarea id="uImpPasteInput" rows="5" placeholder="Copy rows from Excel or Google Sheets and paste them here directly..." style="width:100%; padding:10px; font-family:monospace; font-size:11px; border:1px solid var(--border); border-radius:6px; background:var(--bg-main); color:var(--text-body); resize:vertical;"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                    <button class="action-btn" style="background:var(--bg-card); color:var(--text-muted); border:1px solid var(--border); font-size:11px; padding:5px 12px;" onclick="window.togglePasteArea()">
                        Cancel
                    </button>
                    <button class="action-btn" style="background:var(--success); font-size:11px; padding:5px 14px;" onclick="window.handlePasteSubmit()">
                        Parse Pasted Data
                    </button>
                </div>
            </div>

            <!-- FILE STATUS BANNER -->
            <div id="uImpFileBanner" style="display:none; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:8px; padding:10px 14px; margin-bottom:16px; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">✅</span>
                    <div>
                        <div id="uImpFileName" style="font-weight:700; font-size:12px; color:var(--text-body);"></div>
                        <div id="uImpFileMeta" style="font-size:10px; color:var(--text-muted);"></div>
                    </div>
                </div>
                <div id="uImpSheetSelectorWrap" style="display:none; align-items:center; gap:6px;">
                    <label style="font-size:10px; font-weight:700; color:var(--text-muted);">Sheet:</label>
                    <select id="uImpSheetSelect" onchange="window.handleSheetSwitch(this.value)" style="padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size:11px; background:var(--bg-main); color:var(--text-body); font-weight:600;"></select>
                </div>
            </div>

            <!-- COLUMN MAPPING SECTION -->
            <div id="uImpMappingSection" style="display:none; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:13px; font-weight:800; color:var(--text-body);">
                        3. Review Column Mapping
                    </h4>
                    <span style="font-size:10px; color:var(--text-muted);">
                        Headers are automatically matched; adjust any dropdown if needed.
                    </span>
                </div>
                <div id="uImpMappingGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; background:var(--bg-inner); border:1px solid var(--border); border-radius:10px; padding:12px; max-height:220px; overflow-y:auto;">
                    <!-- Injected dynamically -->
                </div>
            </div>

            <!-- PREVIEW TABLE & SUMMARY STATS -->
            <div id="uImpPreviewSection" style="display:none; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:13px; font-weight:800; color:var(--text-body);">
                        4. Live Data Preview (First 5 Rows)
                    </h4>
                    <div id="uImpPreviewStats" style="display:flex; gap:8px; font-size:11px;">
                        <!-- Stat badges injected dynamically -->
                    </div>
                </div>
                <div style="overflow-x:auto; border:1px solid var(--border); border-radius:8px; background:var(--bg-card); max-height:260px;">
                    <table class="premium-table" id="uImpPreviewTable" style="margin:0; font-size:11px;" role="table">
                        <!-- Table header & rows injected dynamically -->
                    </table>
                </div>
            </div>

            <!-- ACTION FOOTER -->
            <div id="uImpActionFooter" style="display:none; border-top:1px solid var(--border); padding-top:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="font-size:11px; color:var(--text-muted);" id="uImpFooterNotice">
                    All valid rows will be processed and integrated immediately.
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="action-btn" style="background:var(--bg-inner); color:var(--text-muted); border:1px solid var(--border); font-size:11px; padding:8px 14px;" onclick="window.resetUniversalImporter()">
                        Reset
                    </button>
                    <button class="action-btn" id="uImpExecuteBtn" style="background:var(--success); font-size:12px; font-weight:800; padding:8px 20px; box-shadow:0 2px 10px rgba(34,197,94,0.3);" onclick="window.executeUniversalImport()">
                        🚀 Execute Import & Combine Data
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    // Download template for currently selected module
    window.downloadCurrentTemplate = function () {
        const modKey = document.getElementById('uImpModuleSelect')?.value || activeParsedData.moduleKey;
        window.downloadModuleImportTemplate(modKey);
    };

    // Module change handler
    window.handleImporterModuleChange = function (newModuleKey) {
        activeParsedData.moduleKey = newModuleKey;
        const schema = IMPORTER_MODULES[newModuleKey];
        if (!schema) return;

        const hintEl = document.getElementById('uImpModuleHint');
        if (hintEl) hintEl.innerText = schema.primaryKeyDesc;

        const rosterWrap = document.getElementById('uImpRosterCycleWrap');
        if (rosterWrap) rosterWrap.style.display = newModuleKey === 'roster_engine' ? 'block' : 'none';

        // Re-run column mapping if data is already loaded
        if (activeParsedData.rawHeaders.length > 0) {
            activeParsedData.columnMapping = autoDetectColumnMapping(newModuleKey, activeParsedData.rawHeaders);
            renderColumnMappingUI();
            renderPreviewTableUI();
        }
    };

    // Mode change handler
    window.handleImporterModeChange = function (newMode) {
        activeParsedData.combineMode = newMode;
        renderPreviewTableUI();
    };

    // Toggle paste input area
    window.togglePasteArea = function () {
        const pasteWrap = document.getElementById('uImpPasteWrap');
        if (!pasteWrap) return;
        const isHidden = pasteWrap.style.display === 'none';
        pasteWrap.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            document.getElementById('uImpPasteInput').focus();
        }
    };

    // Handle pasted data submission
    window.handlePasteSubmit = function () {
        const text = document.getElementById('uImpPasteInput')?.value;
        if (!text || !text.trim()) {
            if (typeof customAlert === 'function') customAlert("Please paste tabular data or CSV text.");
            return;
        }

        try {
            const modKey = document.getElementById('uImpModuleSelect')?.value || activeParsedData.moduleKey;
            parseCsvString(text.trim(), modKey, "Pasted_Spreadsheet_Data.csv");
            window.togglePasteArea();
            updateImporterViewAfterParse();
        } catch (e) {
            if (typeof customAlert === 'function') customAlert("Failed to parse pasted data: " + e.message);
        }
    };

    // File drag and drop handlers
    function setupDragAndDrop() {
        const dropzone = document.getElementById('uImpDropzone');
        if (!dropzone) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = 'var(--primary)';
                dropzone.style.background = 'var(--primary-light, rgba(0,75,135,0.06))';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = 'var(--border)';
                dropzone.style.background = 'var(--bg-card)';
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                processUploadedFile(files[0]);
            }
        }, false);
    }

    // File input selection handler
    window.handleFileSelect = function (event) {
        const file = event.target.files?.[0];
        if (file) {
            processUploadedFile(file);
        }
    };

    function processUploadedFile(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const buffer = e.target.result;
                const modKey = document.getElementById('uImpModuleSelect')?.value || activeParsedData.moduleKey;
                parseFileBuffer(buffer, modKey, file.name);
                updateImporterViewAfterParse();
            } catch (err) {
                console.error("File parse error:", err);
                if (typeof customAlert === 'function') customAlert("Error parsing file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Switch active sheet if workbook has multiple
    window.handleSheetSwitch = function (sheetName) {
        activeParsedData.selectedSheet = sheetName;
        // Re-read workbook sheet if needed
        renderColumnMappingUI();
        renderPreviewTableUI();
    };

    // Update the UI once data has been parsed
    function updateImporterViewAfterParse() {
        const fileBanner = document.getElementById('uImpFileBanner');
        const fileNameEl = document.getElementById('uImpFileName');
        const fileMetaEl = document.getElementById('uImpFileMeta');
        const mappingSection = document.getElementById('uImpMappingSection');
        const previewSection = document.getElementById('uImpPreviewSection');
        const actionFooter = document.getElementById('uImpActionFooter');

        if (fileBanner) fileBanner.style.display = 'flex';
        if (fileNameEl) fileNameEl.innerText = activeParsedData.fileName;
        if (fileMetaEl) {
            fileMetaEl.innerText = `${activeParsedData.rawRows.length} data rows detected • ${activeParsedData.rawHeaders.length} columns`;
        }

        const sheetSelectWrap = document.getElementById('uImpSheetSelectorWrap');
        const sheetSelect = document.getElementById('uImpSheetSelect');
        if (sheetSelectWrap && sheetSelect && activeParsedData.sheetNames.length > 1) {
            sheetSelectWrap.style.display = 'flex';
            sheetSelect.innerHTML = activeParsedData.sheetNames.map(s =>
                `<option value="${s}" ${s === activeParsedData.selectedSheet ? 'selected' : ''}>${s}</option>`
            ).join('');
        } else if (sheetSelectWrap) {
            sheetSelectWrap.style.display = 'none';
        }

        if (mappingSection) mappingSection.style.display = 'block';
        if (previewSection) previewSection.style.display = 'block';
        if (actionFooter) actionFooter.style.display = 'flex';

        renderColumnMappingUI();
        renderPreviewTableUI();
    }

    // Render the column mapping dropdowns
    function renderColumnMappingUI() {
        const grid = document.getElementById('uImpMappingGrid');
        if (!grid) return;

        const schema = IMPORTER_MODULES[activeParsedData.moduleKey];
        if (!schema) return;

        grid.innerHTML = schema.fields.map(field => {
            const currentMappedIdx = activeParsedData.columnMapping[field.key];
            return `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:8px 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; font-size:11px; color:var(--text-body);">
                        ${field.label} ${field.required ? '<span style="color:var(--danger)">*</span>' : ''}
                    </span>
                    <span style="font-size:9px; color:var(--text-muted); font-family:monospace;">${field.type}</span>
                </div>
                <select onchange="window.updateFieldMapping('${field.key}', this.value)" style="width:100%; padding:5px 8px; border:1px solid var(--border); border-radius:4px; font-size:11px; background:var(--bg-main); color:var(--text-body);">
                    <option value="-1" ${currentMappedIdx === -1 || currentMappedIdx === undefined ? 'selected' : ''}>-- (Skip Column) --</option>
                    ${activeParsedData.rawHeaders.map((header, idx) => `
                        <option value="${idx}" ${currentMappedIdx === idx ? 'selected' : ''}>
                            Col ${idx + 1}: ${header}
                        </option>
                    `).join('')}
                </select>
            </div>
            `;
        }).join('');
    }

    window.updateFieldMapping = function (fieldKey, colIdxStr) {
        activeParsedData.columnMapping[fieldKey] = parseInt(colIdxStr, 10);
        renderPreviewTableUI();
    };

    // Extract structured objects based on active column mappings
    function extractMappedRows() {
        const schema = IMPORTER_MODULES[activeParsedData.moduleKey];
        if (!schema) return [];

        return activeParsedData.rawRows.map(rawRow => {
            const obj = {};
            schema.fields.forEach(field => {
                const colIdx = activeParsedData.columnMapping[field.key];
                if (colIdx !== undefined && colIdx >= 0 && colIdx < rawRow.length) {
                    obj[field.key] = rawRow[colIdx];
                } else {
                    obj[field.key] = "";
                }
            });
            return obj;
        });
    }

    // Render live data preview table (first 5 rows)
    function renderPreviewTableUI() {
        const table = document.getElementById('uImpPreviewTable');
        const statsEl = document.getElementById('uImpPreviewStats');
        if (!table) return;

        const schema = IMPORTER_MODULES[activeParsedData.moduleKey];
        if (!schema) return;

        const mappedRows = extractMappedRows();
        const previewRows = mappedRows.slice(0, 5);

        // Render header
        const theadHtml = `
        <thead>
            <tr style="background:var(--bg-inner); border-bottom:1px solid var(--border);">
                <th style="padding:6px 10px; font-size:10px; font-weight:700; text-align:center;">#</th>
                <th style="padding:6px 10px; font-size:10px; font-weight:700;">Action</th>
                ${schema.fields.map(f => `
                    <th style="padding:6px 10px; font-size:10px; font-weight:700;">${f.label}</th>
                `).join('')}
            </tr>
        </thead>
        `;

        // Render rows
        const tbodyHtml = `
        <tbody>
            ${previewRows.map((row, idx) => {
                const actionBadge = activeParsedData.combineMode === 'merge'
                    ? `<span style="background:rgba(59,130,246,0.15); color:var(--primary); font-size:9px; font-weight:700; padding:2px 6px; border-radius:4px;">🔄 Merge / Sync</span>`
                    : activeParsedData.combineMode === 'replace'
                        ? `<span style="background:rgba(239,68,68,0.15); color:var(--danger); font-size:9px; font-weight:700; padding:2px 6px; border-radius:4px;">⚠️ Overwrite</span>`
                        : `<span style="background:rgba(34,197,94,0.15); color:var(--success); font-size:9px; font-weight:700; padding:2px 6px; border-radius:4px;">➕ Append</span>`;

                return `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:6px 10px; font-size:10px; text-align:center; font-weight:600; color:var(--text-muted);">${idx + 1}</td>
                    <td style="padding:6px 10px; white-space:nowrap;">${actionBadge}</td>
                    ${schema.fields.map(f => {
                        let val = row[f.key];
                        if (f.type === 'date') val = normalizeDate(val) || val;
                        return `<td style="padding:6px 10px; font-size:11px; white-space:nowrap;">${val || '<span style="color:var(--text-muted);">-</span>'}</td>`;
                    }).join('')}
                </tr>
                `;
            }).join('')}
        </tbody>
        `;

        table.innerHTML = theadHtml + tbodyHtml;

        if (statsEl) {
            statsEl.innerHTML = `
            <span style="background:var(--bg-inner); border:1px solid var(--border); padding:3px 8px; border-radius:4px; font-weight:600;">
                📊 Total Sheet Rows: <strong>${mappedRows.length}</strong>
            </span>
            <span style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); color:var(--success); padding:3px 8px; border-radius:4px; font-weight:700;">
                Mode: <strong>${activeParsedData.combineMode.toUpperCase()}</strong>
            </span>
            `;
        }
    }

    // Reset importer view
    window.resetUniversalImporter = function () {
        activeParsedData.rawHeaders = [];
        activeParsedData.rawRows = [];
        activeParsedData.columnMapping = {};

        const fileBanner = document.getElementById('uImpFileBanner');
        const mappingSection = document.getElementById('uImpMappingSection');
        const previewSection = document.getElementById('uImpPreviewSection');
        const actionFooter = document.getElementById('uImpActionFooter');
        const pasteWrap = document.getElementById('uImpPasteWrap');

        if (fileBanner) fileBanner.style.display = 'none';
        if (mappingSection) mappingSection.style.display = 'none';
        if (previewSection) previewSection.style.display = 'none';
        if (actionFooter) actionFooter.style.display = 'none';
        if (pasteWrap) pasteWrap.style.display = 'none';

        const fileInput = document.getElementById('uImpFileInput');
        if (fileInput) fileInput.value = "";
    };

    // Execute the import and combine operation
    window.executeUniversalImport = function () {
        const modKey = activeParsedData.moduleKey;
        const schema = IMPORTER_MODULES[modKey];
        if (!schema) return;

        const handler = MERGE_HANDLERS[modKey];
        if (!handler) {
            if (typeof customAlert === 'function') customAlert("No import handler configured for " + modKey);
            return;
        }

        const isMatrix = modKey === 'roster_engine' && isRosterMatrixFormat(activeParsedData.rawHeaders);
        let options = { isMatrix: false };

        if (isMatrix) {
            const rosterMonthPicker = document.getElementById('uImpRosterMonth');
            const cycleVal = rosterMonthPicker ? rosterMonthPicker.value : new Date().toISOString().slice(0, 7);
            const [yStr, mStr] = cycleVal.split('-');
            const year = parseInt(yStr, 10);
            const month = mStr;

            // Build matrix structure: each row has staff identifier and array of { dateKey, shiftCode }
            const matrixData = [];
            activeParsedData.rawRows.forEach(row => {
                const staffId = row[0]; // First col is staff name/email
                if (!staffId) return;

                const shifts = [];
                activeParsedData.rawHeaders.forEach((h, hIdx) => {
                    if (hIdx === 0) return;
                    const cleanH = String(h).trim();
                    let dateKey = "";

                    // Day number 1..31
                    const dayNum = parseInt(cleanH, 10);
                    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
                        dateKey = `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
                    } else {
                        dateKey = normalizeDate(cleanH);
                    }

                    if (dateKey && dateKey.startsWith(`${year}-${month}`)) {
                        const shiftVal = row[hIdx];
                        shifts.push({ dateKey, shiftCode: shiftVal });
                    }
                });

                matrixData.push({ staffIdentifier: staffId, shifts });
            });

            options = { isMatrix: true, year, month, matrixData };
        }

        const mappedRows = extractMappedRows();
        if (!isMatrix && mappedRows.length === 0) {
            if (typeof customAlert === 'function') customAlert("No data rows found to import.");
            return;
        }

        try {
            const btn = document.getElementById('uImpExecuteBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Combining Data...';
            }

            const result = handler(mappedRows, activeParsedData.combineMode, options);

            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '🚀 Execute Import & Combine Data';
                }

                const msg = `🎉 Import Complete for ${schema.name}!\n\n` +
                    `• Records Updated (Merged): ${result.updated}\n` +
                    `• New Records Added: ${result.added}\n` +
                    `• Total Module Records: ${result.total}\n\n` +
                    `Data successfully verified and saved to system persistence.`;

                if (typeof customAlert === 'function') {
                    customAlert(msg);
                } else {
                    alert(msg);
                }

                // If running inside modal, close modal
                const modalMount = document.getElementById('systemGlobalModalMount');
                if (modalMount && modalMount.querySelector('.universal-importer-modal-box')) {
                    modalMount.innerHTML = "";
                }
            }, 300);

        } catch (err) {
            console.error("Execution error during import:", err);
            if (typeof customAlert === 'function') customAlert("Failed to execute import: " + err.message);
        }
    };

    // Mount Universal Importer into a target container
    window.renderUniversalImporter = function (containerId, initialModule = "fdo_sheets") {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;

        activeParsedData.moduleKey = initialModule;
        container.innerHTML = buildImporterUI(container.id, initialModule);
        setupDragAndDrop();
    };

    // Open as Universal Modal from ANY module
    window.openUniversalImporterModal = function (targetModule = "fdo_sheets") {
        const mount = document.getElementById('systemGlobalModalMount');
        if (!mount) return;

        mount.innerHTML = `
        <div class="system-inline-modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px;" onclick="if(event.target===this)document.getElementById('systemGlobalModalMount').innerHTML=''">
            <div class="system-inline-modal-box universal-importer-modal-box" style="background:var(--bg-main); width:100%; max-width:960px; max-height:90vh; overflow-y:auto; border-radius:14px; border:1px solid var(--border); box-shadow:0 10px 40px rgba(0,0,0,0.3); padding:20px; position:relative;">
                <button onclick="document.getElementById('systemGlobalModalMount').innerHTML=''" style="position:absolute; top:16px; right:16px; background:var(--bg-inner); border:1px solid var(--border); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; color:var(--text-muted);">&times;</button>
                <div id="uImpModalContainer"></div>
            </div>
        </div>
        `;

        window.renderUniversalImporter('uImpModalContainer', targetModule);
    };

    // Export Hub Sub-Tab Switching Controller
    window.switchExportHubTab = function (tabKey) {
        const tabExportBtn = document.getElementById('btnTabExportView');
        const tabImportBtn = document.getElementById('btnTabImportView');
        const exportSection = document.getElementById('exportHubTab_export');
        const importSection = document.getElementById('exportHubTab_import');

        if (!exportSection || !importSection) return;

        if (tabKey === 'import') {
            exportSection.style.display = 'none';
            importSection.style.display = 'block';

            if (tabExportBtn) {
                tabExportBtn.style.background = 'var(--bg-inner)';
                tabExportBtn.style.color = 'var(--text-body)';
                tabExportBtn.style.border = '1px solid var(--border)';
            }
            if (tabImportBtn) {
                tabImportBtn.style.background = 'var(--primary)';
                tabImportBtn.style.color = '#fff';
                tabImportBtn.style.border = 'none';
            }

            // Initialize importer in the hub if not already rendered
            const mount = document.getElementById('uImpExportHubMount');
            if (mount && !mount.querySelector('.universal-importer-container')) {
                window.renderUniversalImporter('uImpExportHubMount', 'fdo_sheets');
            }
        } else {
            exportSection.style.display = 'block';
            importSection.style.display = 'none';

            if (tabExportBtn) {
                tabExportBtn.style.background = 'var(--primary)';
                tabExportBtn.style.color = '#fff';
                tabExportBtn.style.border = 'none';
            }
            if (tabImportBtn) {
                tabImportBtn.style.background = 'var(--bg-inner)';
                tabImportBtn.style.color = 'var(--text-body)';
                tabImportBtn.style.border = '1px solid var(--border)';
            }
        }
    };

})();
