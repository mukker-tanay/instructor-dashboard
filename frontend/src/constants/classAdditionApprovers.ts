export interface ClassAdditionApprover {
    name: string;
    track: string;
}

export const CLASS_ADDITION_APPROVERS: ClassAdditionApprover[] = [
    { name: 'Shivank Agrawal', track: 'AIML' },
    { name: 'Viraj Shah', track: 'DSML' },
    { name: 'Akhil', track: 'HLD' },
    { name: 'Ayush Raj', track: 'Full Stack' },
    { name: 'Yogesh K', track: 'DSA' },
    { name: 'Vilas Varghese', track: 'DevOps' },
];

export const formatApproverLabel = (approver: ClassAdditionApprover) =>
    `${approver.name} (${approver.track})`;
