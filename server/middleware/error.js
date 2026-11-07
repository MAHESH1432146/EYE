import { ZodError } from 'zod';
import { ApiError } from '../utils/helpers.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  req[source] = result.data;
  next();
};

export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) err = new ApiError(400, 'Validation failed');
  let status = err.status || 500;
  let message = err.message;
  if (err.code === 11000) {
    status = 409;
    message = 'A record with these values already exists';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.name === 'ValidationError' || err.name === 'MulterError') {
    status = 400;
  }
  if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
  }
  res.status(status).json({ success: false, message, details: err.details });
}
