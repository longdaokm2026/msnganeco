import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AssignmentAudioStorageService, type AudioUploadFile } from "./assignment-audio-storage.service";
import { ListeningRepository, type ListeningResult, type ListeningTrackInput } from "./listening.repository";

@Injectable()
export class ListeningService {
  constructor(@Inject(ListeningRepository) private readonly repository: ListeningRepository, @Inject(AssignmentAudioStorageService) private readonly storage: AssignmentAudioStorageService) {}
  private value<T>(result: ListeningResult<T>) {
    if (result.status === "OK") return result.value;
    if (result.status === "NOT_FOUND") throw new NotFoundException(result.message ?? "Không tìm thấy Listening hoặc bạn không có quyền truy cập.");
    if (result.status === "INVALID_STATE" || result.status === "LIMIT") throw new ConflictException(result.message ?? "Không thể thực hiện thao tác Listening ở trạng thái hiện tại.");
    throw new BadRequestException(result.message ?? "Dữ liệu Listening không hợp lệ.");
  }
  createTrack(teacherId: string, assignmentId: string, input: ListeningTrackInput) { return this.repository.createTrack(teacherId, assignmentId, input).then((result) => this.value(result)); }
  updateTrack(teacherId: string, assignmentId: string, trackId: string, input: ListeningTrackInput) { return this.repository.updateTrack(teacherId, assignmentId, trackId, input).then((result) => this.value(result)); }
  reorderTracks(teacherId: string, assignmentId: string, ids: string[]) { return this.repository.reorderTracks(teacherId, assignmentId, ids).then((result) => this.value(result)); }
  async deleteTrack(teacherId: string, assignmentId: string, trackId: string) { const value = this.value(await this.repository.deleteTrack(teacherId, assignmentId, trackId)); if (value.oldStorageKey) await this.storage.remove(value.oldStorageKey); return { success: true }; }

  async uploadAudio(teacherId: string, assignmentId: string, trackId: string, file: AudioUploadFile | undefined) {
    if (!file) throw new BadRequestException("Vui lòng chọn file Listening.");
    const saved = await this.storage.save(file, "listening");
    let result;
    try { result = await this.repository.saveAudio(teacherId, assignmentId, trackId, { fileName: file.originalname, fileType: saved.mime, fileSize: file.size, storageKey: saved.storageKey }); }
    catch (error) { await this.storage.remove(saved.storageKey); throw error; }
    if (result.status !== "OK") { await this.storage.remove(saved.storageKey); return this.value(result); }
    if (result.value.oldStorageKey) await this.storage.remove(result.value.oldStorageKey);
    return result.value.track;
  }
  async removeAudio(teacherId: string, assignmentId: string, trackId: string) { const value = this.value(await this.repository.removeAudio(teacherId, assignmentId, trackId)); if (value.oldStorageKey) await this.storage.remove(value.oldStorageKey); return { success: true }; }
  async teacherAudio(teacherId: string, assignmentId: string, trackId: string) { const record = await this.repository.teacherAudio(teacherId, assignmentId, trackId); if (!record) throw new NotFoundException("Không tìm thấy file Listening."); return { ...record, contents: await this.storage.read(record.storageKey) }; }
  async play(studentId: string, attemptId: string, trackId: string) { const record = this.value(await this.repository.play(studentId, attemptId, trackId)); return { ...record, contents: await this.storage.read(record.storageKey) }; }
}
