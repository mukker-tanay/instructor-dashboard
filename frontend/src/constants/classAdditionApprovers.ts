export interface ClassAdditionApprover {
    name: string;
    track: string;
}

export const CLASS_ADDITION_APPROVERS: ClassAdditionApprover[] = [
    { name: 'Shivank Agrawal', track: 'If not sure, please select this' },
    { name: 'Viraj Shah', track: 'AIML/DSML' },
    { name: 'Akhil', track: 'Academy non-DSA Modules' },
    { name: 'Ayush Raj', track: 'Full Stack' },
    { name: 'Yogesh K', track: 'DSA' },
    { name: 'Vilas Varghese', track: 'DevOps' },
];

export const formatApproverLabel = (approver: ClassAdditionApprover) =>
    `${approver.name} (${approver.track})`;
