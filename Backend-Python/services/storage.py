import asyncio
import boto3
import logging
import os
import shutil
import tempfile
from abc import ABC, abstractmethod
from botocore.exceptions import ClientError
from contextlib import asynccontextmanager
from pathlib import Path
from typing import BinaryIO, AsyncGenerator

from config import settings

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
    @asynccontextmanager
    async def download(self, key: str) -> AsyncGenerator[str, None]:
        """Download file to a local temp path if needed, and auto-cleanup after."""
        yield ""

class LocalStorageClient(StorageClient):
    # local filesystem implementation of StorageClient
    def _get_safe_path(self, key: str) -> Path:
        return self.base_dir / key.lstrip("/")

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

    @asynccontextmanager
    async def download(self, key: str) -> AsyncGenerator[str, None]:
        yield str(self._get_safe_path(key))

class R2StorageClient(StorageClient):
    # local filesystem implementation of StorageClient
    def __init__(self):
        self.bucket_name = settings.R2_BUCKET_NAME
        self.s3_client = boto3.client(
            service_name="s3", 
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com", 
            aws_access_key_id=settings.R2_ACCESS_KEY_ID, 
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto"
        )

    def _get_safe_key(self, key: str) -> str:
        return key.lstrip("/")

    def get_url(self, key: str) -> str:
        safe_key = self._get_safe_key(key)
        return self.s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket_name, 'Key': safe_key},
            ExpiresIn=300
        )

    async def save_upload(self, file_obj: BinaryIO, key: str) -> str:
        safe_key = self._get_safe_key(key)
        file_obj.seek(0)
        await asyncio.to_thread(
            self.s3_client.upload_fileobj,
            file_obj,
            self.bucket_name,
            safe_key
        )
        logger.info("Saved upload to R2: %s", safe_key)
        return safe_key
    
    async def move_file(self, src_key: str, dest_key: str) -> str:
        safe_src = self._get_safe_key(src_key)
        safe_dest = self._get_safe_key(dest_key)

        copy_source = {'Bucket': self.bucket_name, 'Key': safe_src}
        await asyncio.to_thread(
            self.s3_client.copy_object, 
            CopySource=copy_source, 
            Bucket=self.bucket_name, 
            Key=safe_dest
        )
        await asyncio.to_thread(
            self.s3_client.delete_object, 
            Bucket=self.bucket_name, 
            Key=safe_src
        )

        logger.info("Moved file in R2 from %s to %s", safe_src, safe_dest)
        return safe_dest

    async def delete_file(self, key: str) -> None:
        safe_key = self._get_safe_key(key)
        try:
            await asyncio.to_thread(
                self.s3_client.delete_object, 
                Bucket=self.bucket_name, 
                Key=safe_key
            )
            logger.info("Deleted file from R2: %s", safe_key)
        except Exception as e:
            logger.error("Failed to delete file %s from R2: %s", safe_key, e)

    async def file_exists(self, key: str) -> bool:
        safe_key = self._get_safe_key(key)
        try:
            await asyncio.to_thread(
                self.s3_client.head_object, 
                Bucket=self.bucket_name, 
                Key=safe_key
            )
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise

    async def list_files(self, prefix: str = "") -> list[str]:
        safe_prefix = self._get_safe_key(prefix)
        paginator = self.s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=self.bucket_name, Prefix=safe_prefix)
        
        def _collect():
            results = []
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        results.append(obj['Key'])
            return results
        
        return await asyncio.to_thread(_collect)

    @asynccontextmanager
    async def download(self, key: str) -> AsyncGenerator[str, None]:
        safe_key = self._get_safe_key(key)
        ext = os.path.splitext(safe_key)[1] or ".tmp"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp_path = tmp.name
        tmp.close()

        try:
            await asyncio.to_thread(
                self.s3_client.download_file,
                self.bucket_name,
                safe_key,
                tmp_path
            )
            yield tmp_path
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

if settings.R2_ACCOUNT_ID:
    storage = R2StorageClient()
else:
    storage = LocalStorageClient()
