/* ── TypeScript interfaces matching backend models ── */

export interface User {
    email: string;
    name: string;
    picture: string;
    role: 'instructor' | 'admin';
}

export interface ClassItem {
    'SBAT Group ID': string;
    'Instructor Email': string;
    'Instructor Name': string;
    'Program': string;
    'Batch Name': string;
    'Module Name': string;
    'Class Title': string;
    'Date of Class (MM/DD/YYYY)': string;
    'Time of Class (HH:MM AM/PM) IST': string;
    'Class Type': string;
    'Class Type (Regular/Optional)': string;
    'Total Attendance Percentage': string;
    'Average Rating': string;
    'Number of Ratings': string;
    [key: string]: string;
}

export interface ClassesResponse {
    classes: ClassItem[];
    total: number;
    offset: number;
    limit: number;
}

export interface UnavailabilityPayload {
    classes: ClassItem[];
    reason: string;
    topics_and_promises: string;
    batch_pulse_persona: string;
    teaching_pace_style: string;
    suggested_replacement?: string;
    other_comments?: string;
}

export interface ClassAdditionPayload {
    program: string;
    batch_name: string;
    class_title: string;
    module_name: string;
    date_of_class: string;
    time_of_class: string;
    class_type: string;
    shift_other_classes: string;
    contest_impact: string;
    assignment_requirement: string;
    reason: string;
    other_comments?: string;
    approver: string;
}

export interface RequestItem {
    request_id?: string;
    'Request ID'?: string;
    request_type: 'unavailability' | 'class_addition';
    'Instructor Email'?: string;
    'Instructor Name'?: string;
    'Program'?: string;
    'Batch Name'?: string;
    'Class Title'?: string;
    'Module Name'?: string;
    'Reason for Unavailability'?: string;
    'Reason for Addition of Class'?: string;
    'Class Type'?: string;
    'Class Type (Regular/Optional)'?: string;
    status?: string;
    Status?: string;
    locked_by?: string;
    locked_at?: string;
    'Raised Timestamp'?: string;
    'Time stamp'?: string;
    'Any Other Comments'?: string;
    'Other Comments'?: string;
    'Original Date of Class (MM/DD/YYYY)'?: string;
    'Date of Class (MM/DD/YYYY)'?: string;
    'Original Time of Class (HH:MM AM/PM) IST'?: string;
    'Time of Class (HH:MM AM/PM) IST'?: string;
    [key: string]: unknown;
}

export interface RequestsResponse {
    requests: RequestItem[];
    total: number;
}

export interface StatusUpdate {
    status: 'Approved' | 'Rejected';
    payment_status?: 'Sanctioned' | 'Non-sanctioned' | 'Unpaid';
    red_flag?: 'Yes' | 'No';
    red_flag_reason?: string;
    replacement_instructor?: string;
    final_status?: string;
}
