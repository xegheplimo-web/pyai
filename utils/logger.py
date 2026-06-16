"""
MAS-OpenClaw Logger - Rich console + file logging
"""
import logging
import sys
from pathlib import Path
from rich.logging import RichHandler
from utils.config import config


def setup_logger(name: str = "mas") -> logging.Logger:
    """Create a logger with rich console output and file backend."""
    config.ensure_dirs()

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, config.LOG_LEVEL, logging.INFO))

    # Avoid duplicate handlers
    if logger.handlers:
        return logger

    # Rich console handler
    console_handler = RichHandler(
        rich_tracebacks=True,
        show_path=True,
        show_time=True,
        markup=True,
    )
    console_handler.setLevel(logging.DEBUG)
    console_format = logging.Formatter("%(message)s")
    console_handler.setFormatter(console_format)

    # File handler
    log_path = Path(config.LOG_FILE)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler.setFormatter(file_format)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


# Global logger instance
log = setup_logger()
