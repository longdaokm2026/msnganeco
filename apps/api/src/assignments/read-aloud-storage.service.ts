import { Injectable } from "@nestjs/common";
import { LocalAssignmentAudioStorageService } from "./assignment-audio-storage.service";
export type { AudioUploadFile } from "./assignment-audio-storage.service";

@Injectable()
export class ReadAloudStorageService extends LocalAssignmentAudioStorageService {}
