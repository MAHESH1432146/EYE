import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import AuthLayout, { AuthLink } from '../../layouts/AuthLayout.jsx';
import FormField from '../../components/FormField.jsx';
import Alert from '../../components/Alert.jsx';
import api, { errorMessage } from '../../services/api.js';

export default function ForgotPassword() {
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (values) => {
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', values);
      setDone(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your email to generate a reset link."
      footer={<AuthLink to="/login">Back to sign in</AuthLink>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        {done && (
          <Alert type="success">
            {done.message}
            {done.devResetToken && (
              <div className="mt-2">
                Development mode (no mail server):{' '}
                <a className="underline" href={`/reset-password?token=${done.devResetToken}`}>open reset page</a>
              </div>
            )}
          </Alert>
        )}
        <FormField label="Email" type="email" error={errors.email}
          {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
        </button>
      </form>
    </AuthLayout>
  );
}
