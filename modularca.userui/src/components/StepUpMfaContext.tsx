import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import StepUpMfaModal from './StepUpMfaModal';

/// <summary>
/// React context provider for step-up MFA verification.
/// Provides a requireStepUp function that shows the MFA modal and returns
/// a Promise resolving to the MFA token on successful verification.
/// </summary>
interface StepUpContext {
    requireStepUp: (operation: string, targetId?: string) => Promise<string>;
}

const StepUpCtx = createContext<StepUpContext>({
    requireStepUp: () => Promise.reject(new Error('No StepUpMfaProvider')),
});

export const useStepUp = () => useContext(StepUpCtx);

export const StepUpMfaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [operation, setOperation] = useState('');
    const [targetId, setTargetId] = useState<string | undefined>();
    const resolveRef = useRef<((token: string) => void) | null>(null);
    const rejectRef = useRef<((err: Error) => void) | null>(null);

    const requireStepUp = useCallback((op: string, tid?: string): Promise<string> => {
        setOperation(op);
        setTargetId(tid);
        setIsOpen(true);
        return new Promise<string>((resolve, reject) => {
            resolveRef.current = resolve;
            rejectRef.current = reject;
        });
    }, []);

    const handleSuccess = (mfaToken: string) => {
        setIsOpen(false);
        resolveRef.current?.(mfaToken);
        resolveRef.current = null;
        rejectRef.current = null;
    };

    const handleCancel = () => {
        setIsOpen(false);
        rejectRef.current?.(new Error('Step-up MFA cancelled'));
        resolveRef.current = null;
        rejectRef.current = null;
    };

    return (
        <StepUpCtx.Provider value={{ requireStepUp }}>
            {children}
            <StepUpMfaModal
                isOpen={isOpen}
                operation={operation}
                targetId={targetId}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
            />
        </StepUpCtx.Provider>
    );
};
