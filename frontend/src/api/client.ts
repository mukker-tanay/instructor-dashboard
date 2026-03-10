import axios from 'axios';
import type {
    User,
    ClassesResponse,
    UnavailabilityPayload,
    ClassAdditionPayload,
    RequestsResponse,
    StatusUpdate,
} from '../types';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true,
});

/* ── Auth ── */
export const getMe = () => api.get<User>('/auth/me').then(r => r.data);
export const logout = () => api.post('/auth/logout');
export const impersonateUser = (email: string) =>
    api.post<{ admin_token: string }>('/auth/impersonate', { email }).then(r => r.data);
export const stopImpersonateUser = (adminToken: string) =>
    api.post('/auth/stop-impersonate', { admin_token: adminToken }).then(r => r.data);

/* ── Classes ── */
export const getClasses = (type: 'upcoming' | 'past', limit = 5, offset = 0) =>
    api.get<ClassesResponse>('/classes', { params: { type, limit, offset } }).then(r => r.data);

export const getBatchOptions = () =>
    api.get<{ batches: string[] }>('/classes/batch-options').then(r => r.data);

export const getInstructorOptions = () =>
    api.get<{ instructors: string[] }>('/classes/instructors').then(r => r.data);

export type BatchMeta = { program: string; modules: string[] };
export const getBatchMetadata = () =>
    api.get<{ batch_metadata: Record<string, BatchMeta> }>('/classes/batch-metadata').then(r => r.data);

export type MyBatchesResponse = {
    batches: Record<string, {
        program: string;
        modules: Record<string, Array<Record<string, any>>>;
    }>;
};
export const getMyBatches = () =>
    api.get<MyBatchesResponse>('/classes/my-batches').then(r => r.data);

/* ── Requests (instructor) ── */
export const createUnavailabilityRequest = (data: UnavailabilityPayload) =>
    api.post('/unavailability-requests', data).then(r => r.data);

export const createClassAdditionRequest = (data: ClassAdditionPayload) =>
    api.post('/class-addition-requests', data).then(r => r.data);

export const getMyRequests = () =>
    api.get<RequestsResponse>('/my-requests').then(r => r.data);

/* ── Admin ── */
export const getAdminRequests = (status = 'all', requestType = 'all') =>
    api.get<RequestsResponse>('/admin/requests', {
        params: { status, request_type: requestType },
    }).then(r => r.data);

export const updateRequestStatus = (requestId: string, data: StatusUpdate) =>
    api.patch(`/admin/requests/${requestId}/status`, data).then(r => r.data);

export const deleteRequests = (requestIds: string[]) =>
    api.post<{ message: string; deleted: number; errors: string[] }>('/admin/requests/delete', { request_ids: requestIds }).then(r => r.data);

export const getAllowedInstructors = () =>
    api.get<{ instructors: { email: string; added_by?: string; added_at?: string }[] }>('/admin/instructors').then(r => r.data);

export const addAllowedInstructor = (emails: string[]) =>
    api.post<{ message: string }>('/admin/instructors', { emails }).then(r => r.data);

export const updateAllowedInstructorAlias = (email: string, alias_email: string) =>
    api.post<{ message: string }>('/admin/instructors/alias', { email, alias_email }).then(r => r.data);

export const removeAllowedInstructor = (email: string) =>
    api.delete<{ message: string }>(`/admin/instructors?email=${encodeURIComponent(email)}`).then(r => r.data);

/* ── Health ── */
export const healthCheck = () => api.get('/health').then(r => r.data);

/* ── Policies ── */
export interface Policy {
    row: number;
    name: string;
    url: string;
    description: string;
    category: string;
    added_by: string;
    added_at: string;
}
export const getPolicies = () =>
    api.get<{ policies: Policy[]; total: number }>('/policies').then(r => r.data);
export const addPolicy = (data: { name: string; url: string; description?: string; category?: string }) =>
    api.post('/policies', data).then(r => r.data);
export const deletePolicy = (rowIndex: number) =>
    api.delete(`/policies/${rowIndex}`).then(r => r.data);

export default api;
