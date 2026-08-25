import { BadRequestException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

export type AudioUploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const allowed = new Map<string, string[]>([
  [".webm", ["audio/webm"]],
  [".ogg", ["audio/ogg"]],
  [".m4a", ["audio/mp4", "audio/x-m4a"]],
  [".mp4", ["audio/mp4"]],
  [".mp3", ["audio/mpeg", "audio/mp3"]],
  [".wav", ["audio/wav", "audio/x-wav"]],
]);

@Injectable()
export class ReadAloudStorageService {
  readonly directory = process.env.ASSIGNMENT_UPLOAD_DIR?.trim() || join(tmpdir(), "msngan-assignments", "audio");

  validate(file: AudioUploadFile) {
    if (file.size > MAX_AUDIO_BYTES) throw new PayloadTooLargeException("Bản ghi không được vượt quá 20 MB.");
    if (!file.size) throw new BadRequestException("Bản ghi âm đang trống.");
    const extension = extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase().split(";", 1)[0]!.trim();
    if (!allowed.get(extension)?.includes(mime)) throw new BadRequestException("Định dạng bản ghi không được hỗ trợ.");
    const bytes = file.buffer;
    const signatureOk = extension === ".webm" ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : extension === ".ogg" ? bytes.subarray(0, 4).toString() === "OggS"
      : extension === ".m4a" || extension === ".mp4" ? bytes.subarray(4, 8).toString() === "ftyp"
      : extension === ".wav" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
      : bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    if (!signatureOk) throw new BadRequestException("Nội dung bản ghi không khớp với định dạng đã chọn.");
    return { extension, mime };
  }

  async save(file: AudioUploadFile) {
    const { extension, mime } = this.validate(file);
    const storageKey = `${randomUUID()}${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(storageKey), file.buffer, { flag: "wx" });
    return { storageKey, mime };
  }

  read(storageKey: string) { return readFile(this.path(storageKey)); }
  async remove(storageKey: string) { try { await unlink(this.path(storageKey)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  path(storageKey: string) {
    if (storageKey !== storageKey.split(/[\\/]/).at(-1) || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(storageKey)) throw new BadRequestException("Storage key không hợp lệ.");
    return join(this.directory, storageKey);
  }
}
