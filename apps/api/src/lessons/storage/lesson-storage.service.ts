import { BadRequestException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const allowed = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"],
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

@Injectable()
export class LessonStorageService {
  readonly directory = process.env.LESSON_UPLOAD_DIR?.trim() || join(tmpdir(), "msngan-lessons");

  validate(file: UploadFile) {
    if (file.size > 10 * 1024 * 1024) throw new PayloadTooLargeException("Tệp tải lên không được vượt quá 10 MB.");
    if (!file.size) throw new BadRequestException("Tệp tải lên đang trống.");
    const extension = extname(file.originalname).toLowerCase();
    if (!allowed.has(extension) || allowed.get(extension) !== file.mimetype) throw new BadRequestException("Định dạng tệp không được hỗ trợ.");
    const bytes = file.buffer;
    const signatureOk = extension === ".pdf" ? bytes.subarray(0, 4).toString() === "%PDF"
      : extension === ".png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === ".jpg" || extension === ".jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : extension === ".webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
      : bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!signatureOk) throw new BadRequestException("Nội dung tệp không khớp với định dạng đã chọn.");
    return extension;
  }

  async save(file: UploadFile) {
    const extension = this.validate(file); const storageKey = `${randomUUID()}${extension}`;
    await mkdir(this.directory, { recursive: true }); await writeFile(this.path(storageKey), file.buffer, { flag: "wx" }); return storageKey;
  }
  async read(storageKey: string) { return readFile(this.path(storageKey)); }
  async restore(storageKey: string, contents: Buffer) { await mkdir(this.directory, { recursive: true }); await writeFile(this.path(storageKey), contents); }
  async remove(storageKey: string) { await unlink(this.path(storageKey)); }
  path(storageKey: string) {
    if (storageKey !== storageKey.split(/[\\/]/).at(-1) || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(storageKey)) throw new BadRequestException("Storage key không hợp lệ.");
    return join(this.directory, storageKey);
  }
}
