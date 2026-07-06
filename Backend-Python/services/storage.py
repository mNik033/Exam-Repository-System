import logging
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)

UPLOADS_DIR = "uploads"

class StorageClient(ABC):
    @abstractmethod
    def get_url(self, key: str) -> str:
        """Get the public URL for the frontend."""

    @abstractmethod
    async def save_upload(self, file_obj: BinaryIO, key: str) -> str:
        """Save an uploaded file. 'key' can include folders."""

    @abstractmethod
    async def move_file(self, src_key: str, dest_key: str) -> str:
        """Move a file to a new key."""

    @abstractmethod
    async def delete_file(self, key: str) -> None:
        """Delete a file by its key."""
    
    @abstractmethod
    async def file_exists(self, key: str) -> bool:
        """Check if a key exists."""
    
    @abstractmethod
    async def list_files(self, prefix: str = "") -> list[str]:
        """List all keys starting with the prefix."""
    
    @abstractmethod
    def get_path(self, key: str) -> str:
        """Get the absolute/local path if needed."""

class LocalStorageClient(StorageClient):
    # local filesystem implementation of StorageClient

    def __init__(self, base_dir: str = UPLOADS_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_url(self, key: str) -> str:
        return f"uploads/{key}"

    async def save_upload(self, file_obj: BinaryIO, key: str) -> str:
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)
        logger.info("Saved upload: %s", path)
        return key

    async def move_file(self, src_key: str, dest_key: str) -> str:
        src_path = self.base_dir / src_key
        dest_path = self.base_dir / dest_key
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(src_path, dest_path)
        logger.info("Moved file from %s to %s", src_path, dest_path)
        return dest_key

    async def delete_file(self, key: str) -> None:
        path = self.base_dir / key
        try:
            path.unlink(missing_ok=True)
            logger.info("Deleted file: %s", path)
        except Exception as e:
            logger.error("Failed to delete file %s: %s", path, e)
    
    async def file_exists(self, key: str) -> bool:
        return (self.base_dir / key).exists()

    async def list_files(self, prefix: str = "") -> list[str]:
        return [
            str(p.relative_to(self.base_dir)) 
            for p in self.base_dir.glob(f"{prefix}*") 
            if p.is_file()
        ]

    def get_path(self, key: str) -> str:
        return str(self.base_dir / key)

storage = LocalStorageClient()