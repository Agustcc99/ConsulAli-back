export function errorHandler(err, req, res, next) {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      message: err.message || "Error interno del servidor"
    });
  }
  