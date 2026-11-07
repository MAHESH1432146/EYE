import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout, { AuthLink } from '../../layouts/AuthLayout.jsx';
import FormField from '../../components/FormField.jsx';
import Alert from '../../components/Alert.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorMessage } from '../../services/api.js';
import { homeFor } from '../../components/ProtectedRoute.jsx';

export default function Register() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { role: 'participant' } });
  const role = watch('role');

  const onSubmit = async ({ confirmPassword: _c, age, ...values }) => {
    setError('');
    try {
      const user = await signUp({ ...values, ...(age ? { age } : {}) });
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join as a participant or, with an invite code, a researcher."
      footer={<>Already registered? <AuthLink to="/login">Sign in</AuthLink></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <FormField label="Full name" autoComplete="name" error={errors.name}
          {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} />
        <FormField label="Email" type="email" autoComplete="email" error={errors.email}
          {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
        <FormField label="Password" type="password" autoComplete="new-password" error={errors.password}
          hint="Min 8 characters, with a letter and a number."
          {...register('password', {
            required: 'Password is required',
            minLength: { value: 8, message: 'At least 8 characters' },
            validate: (v) => (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) || 'Include a letter and a number',
          })} />
        <FormField label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword}
          {...register('confirmPassword', { validate: (v, f) => v === f.password || 'Passwords do not match' })} />
        <FormField label="Age (optional)" type="number" error={errors.age}
          {...register('age', { min: { value: 10, message: 'Min 10' }, max: { value: 120, message: 'Max 120' } })} />
        <div>
          <label className="label">Role</label>
          <select className="input" {...register('role')}>
            <option value="participant">Participant</option>
            <option value="researcher">Researcher (invite code required)</option>
          </select>
        </div>
        {role === 'researcher' && (
          <FormField label="Researcher invite code" type="password" error={errors.inviteCode}
            {...register('inviteCode', { required: 'Invite code is required' })} />
        )}
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Create account
        </button>
      </form>
    </AuthLayout>
  );
}
