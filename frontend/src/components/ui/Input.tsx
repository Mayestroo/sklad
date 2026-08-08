import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, style, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        style={{
          padding: '8px 12px',
          fontSize: 'var(--text-sm)',
          borderRadius: 'var(--radius-md)',
          border: error ? '1px solid var(--color-error-600)' : '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          width: '100%',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '11px', color: 'var(--color-error-600)' }}>{error}</span>}
    </div>
  );
};
