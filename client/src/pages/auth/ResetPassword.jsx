import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout, { AuthLink } from '../../layouts/AuthLayout.jsx';
import FormField from '../../components/FormField.jsx';
import Alert from '../../components/Alert.jsx';
import api, { errorMessage } from '../../services/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const token = params.get('token');

  const onSubmit = async ({ password }) => {
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setOk(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password." footer={<AuthLink to="/login">Back to sign in</AuthLink>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {!token && <Alert>Missing reset token. Use the link from the forgot-password page.</Alert>}
        <Alert>{error}</Alert>
        {ok && <Alert type="success">Password updated. Redirecting to sign in…</Alert>}
        <FormField label="New password" type="password" error={errors.password}
          {...register('password', {
            required: 'Password is required',
            minLength: { value: 8, message: 'At least 8 characters' },
            validate: (v) => (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) || 'Include a letter and a number',
          })} />
        <FormField label="Confirm password" type="password" error={errors.confirm}
          {...register('confirm', { validate: (v, f) => v === f.password || 'Passwords do not match' })} />
        <button className="btn-primary w-full" disabled={isSubmitting || !token}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Update password
        </button>
      </form>
    </AuthLayout>
  );
}
