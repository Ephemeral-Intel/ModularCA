import React from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    id: string;
    type: ToastType;
    message: string;
    onDismiss: (id: string) => void;
}

const typeStyles: Record<ToastType, string> = {
    success: 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-300',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-800 dark:text-red-300',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-300',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-800 dark:text-blue-300',
};

const typeIcons: Record<ToastType, string> = {
    success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
};

const Toast: React.FC<ToastProps> = ({ id, type, message, onDismiss }) => (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border-l-4 shadow-lg animate-slide-in ${typeStyles[type]}`}>
        <span className="text-lg font-bold flex-shrink-0">{typeIcons[type]}</span>
        <p className="text-sm flex-1">{message}</p>
        <button onClick={() => onDismiss(id)} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">&times;</button>
    </div>
);

export default Toast;
