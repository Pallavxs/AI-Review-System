/**
 * Zod validation middleware factory.
 * Validates req[source] and replaces it with the parsed value.
 * Invalid input → HTTP 400 using the project error response shape.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path = issue.path.length ? issue.path.join('.') : 'request';
          return `${path}: ${issue.message}`;
        })
        .join('; ');

      return res.status(400).json({
        success: false,
        message,
      });
    }

    req[source] = result.data;
    return next();
  };
}

export default validate;
