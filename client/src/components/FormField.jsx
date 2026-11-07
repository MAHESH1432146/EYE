import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const FormField = forwardRef(function FormField({ label, error, type = 'text', hint, ...rest }, ref) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input ref={ref} type={isPassword && show ? 'text' : type} className="input" {...rest} />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="field-error">{error.message}</p>}
    </div>
  );
});

export default FormField;
