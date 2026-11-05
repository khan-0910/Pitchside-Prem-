class PitchsideError(Exception):
    """Base for errors the API turns into a clean response."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(PitchsideError):
    status_code = 404
    code = "not_found"


class InvalidRequestError(PitchsideError):
    status_code = 422
    code = "invalid_request"


class ServiceUnavailableError(PitchsideError):
    status_code = 503
    code = "unavailable"


class SourceUnavailableError(Exception):
    """A data source cannot be read and no snapshot exists."""
