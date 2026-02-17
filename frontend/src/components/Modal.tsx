import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 className="modal-title" style={{ margin: 0 }}>{title}</h2>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onClose}
                        style={{ fontSize: '1.25rem', lineHeight: 1 }}
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

export default Modal;
