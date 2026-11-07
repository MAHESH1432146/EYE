import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout, { AuthLink } from '../../layouts/AuthLayout.jsx';
import FormField from '../../components/FormField.jsx';
import Alert from '../../components/Alert.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorMessage } from '../../services/api.js';
import { homeFor } from '../../components/ProtectedRoute.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = new URLSearchParams(location.search).get('expired');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (values) => {
    setError('');
    try {
      const user = await login(values);
      navigate(location.state?.from?.pathname || homeFor(user), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your research or experiment."
      footer={<>No account? <AuthLink to="/register">Register</AuthLink></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {expired && !error && <Alert>Your session expired. Please sign in again.</Alert>}
        <Alert>{error}</Alert>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          {...register('password', { required: 'Password is required' })}
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('remember')} /> Remember me
          </label>
          <Link to="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</Link>
        </div>
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
      </form>
    </AuthLayout>
  );
}
