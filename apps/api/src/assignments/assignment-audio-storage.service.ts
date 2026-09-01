import { BadRequestException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

export type AudioUploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
export type AssignmentAudioCategory = "speaking" | "listening";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const allowed = new Map<string, string[]>([
  [".webm", ["audio/webm"]],
  [".ogg", ["audio/ogg"]],
  [".m4a", ["audio/mp4", "audio/x-m4a"]],
  [".mp4", ["audio/mp4"]],
  [".mp3", ["audio/mpeg", "audio/mp3"]],
  [".wav", ["audio/wav", "audio/x-wav"]],
]);

export abstract class AssignmentAudioStorageService {
  abstract validate(file: AudioUploadFile): { extension: string; mime: string };
  abstract save(file: AudioUploadFile, category: AssignmentAudioCategory): Promise<{ storageKey: string; mime: string }>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract remove(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalAssignmentAudioStorageService extends AssignmentAudioStorageService {
  readonly directory = process.env.ASSIGNMENT_UPLOAD_DIR?.trim() || join(tmpdir(), "msngan-assignments", "audio");

  validate(file: AudioUploadFile) {
    if (file.size > MAX_AUDIO_BYTES) throw new PayloadTooLargeException("File âm thanh không được vượt quá 10 MB.");
    if (!file.size) throw new BadRequestException("File âm thanh đang trống.");
    const extension = extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase().split(";", 1)[0]!.trim();
    if (!allowed.get(extension)?.includes(mime)) throw new BadRequestException("Định dạng file âm thanh không được hỗ trợ.");
    const bytes = file.buffer;
    const signatureOk = extension === ".webm" ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : extension === ".ogg" ? bytes.subarray(0, 4).toString() === "OggS"
      : extension === ".m4a" || extension === ".mp4" ? bytes.subarray(4, 8).toString() === "ftyp"
      : extension === ".wav" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
      : bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    if (!signatureOk) throw new BadRequestException("Nội dung file âm thanh không khớp với định dạng đã chọn.");
    return { extension, mime };
  }

  async save(file: AudioUploadFile, category: AssignmentAudioCategory) {
    const { extension, mime } = this.validate(file);
    const storageKey = `${category}/${randomUUID()}${extension}`;
    const path = this.path(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer, { flag: "wx" });
    return { storageKey, mime };
  }

  read(storageKey: string) { return readFile(this.path(storageKey)); }
  async remove(storageKey: string) { try { await unlink(this.path(storageKey)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  path(storageKey: string) {
    const valid = /^(?:(?:speaking|listening)\/)?[0-9a-f-]{36}\.[a-z0-9]+$/i.test(storageKey);
    if (!valid) throw new BadRequestException("Storage key không hợp lệ.");
    const root = resolve(this.directory);
    const target = resolve(root, storageKey);
    if (!target.startsWith(`${root}/`)) throw new BadRequestException("Storage key không hợp lệ.");
    return target;
  }
}
