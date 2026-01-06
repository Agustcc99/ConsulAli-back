export const responderBadRequest = (res, message, detalles = undefined) =>
    res.status(400).json({ message, detalles });
  
  export const responderNotFound = (res, message) =>
    res.status(404).json({ message });
  
  export const responderServerError = (res, message, error) =>
    res.status(500).json({ message, error: error?.message });
  