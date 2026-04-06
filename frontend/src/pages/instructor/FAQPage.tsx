import React, { useState } from 'react';

const FAQPage: React.FC = () => {
    // Common FAQs for instructors, based on actual application logic
    const faqs = [
        {
            question: "Can I mark my unavailability for a past class?",
            answer: "Yes, you can raise an unavailability request for a past class, but only if it occurred within the last 2 days (48 hours). For classes older than this, the option will be unavailable."
        },
        {
            question: "How do I raise a class addition request?",
            answer: "Click the 'Add New Class' button on your Dashboard. Ensure you fill out all mandatory fields, including the Batch Name, Module, Date, Time, Reason, and select an Approver. The request will automatically be sent to the relevant Slack channel for approval."
        },
        {
            question: "Why doesn't a batch show up under 'My Batches'?",
            answer: "A batch will only appear in your 'My Batches' tab when you have been assigned to or taken more than 5 classes for that specific batch."
        },
        {
            question: "Why can't I raise an unavailability request for a specific class?",
            answer: "You cannot raise an unavailability request if you already have a 'Pending' request submitted for that exact class. You must wait for the current request to be approved or rejected."
        },
        {
            question: "What details are required when marking a class as unavailable?",
            answer: "To ensure a smooth handover, you are required to provide a reason for your unavailability, topics and promises from the previous class, a description of the batch's pulse and persona, and the recommended teaching pace. You may also suggest a preferred replacement instructor."
        },
        {
            question: "Where can I find the company policies?",
            answer: "You can find all company policies by clicking on your profile icon in the top right corner and selecting 'Policies'."
        }
    ];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFaq = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Frequently Asked Questions</h1>
                <p className="page-subtitle">Find answers to common questions about classes, requests, and policies.</p>
            </div>

            <div className="card" style={{ padding: 'var(--space-lg)' }}>
                {faqs.map((faq, index) => (
                    <div 
                        key={index} 
                        style={{ 
                            borderBottom: index < faqs.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                            paddingBottom: index < faqs.length - 1 ? 'var(--space-md)' : 0,
                            marginBottom: index < faqs.length - 1 ? 'var(--space-md)' : 0
                        }}
                    >
                        <button 
                            onClick={() => toggleFaq(index)}
                            style={{ 
                                width: '100%', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                background: 'none', 
                                border: 'none', 
                                padding: 'var(--space-sm) 0',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: 600,
                                fontSize: '0.9375rem',
                                color: 'var(--text-primary)'
                            }}
                        >
                            <span>{faq.question}</span>
                            <span style={{ 
                                transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                                color: 'var(--text-muted)'
                            }}>
                                ▼
                            </span>
                        </button>
                        
                        {openIndex === index && (
                            <div style={{ 
                                paddingTop: 'var(--space-sm)',
                                color: 'var(--text-secondary)',
                                fontSize: '0.875rem',
                                lineHeight: 1.5
                            }}>
                                {faq.answer}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FAQPage;
