type AuditMetadata = Record<string, unknown>;

const actionLabels: Record<string, string> = {
  USER_REGISTERED: "Đăng ký tài khoản",
  EMAIL_VERIFIED: "Xác thực email",
  PASSWORD_RESET_COMPLETED: "Đặt lại mật khẩu",
  REFRESH_TOKEN_REUSE_DETECTED: "Phát hiện phiên đăng nhập bất thường",
  USER_DISABLED: "Khóa tài khoản",
  USER_ENABLED: "Mở khóa tài khoản",
  USER_PROFILE_UPDATED: "Cập nhật tài khoản",
  VERIFICATION_EMAIL_RESENT: "Gửi lại email xác thực",
  USER_DELETED: "Xóa tài khoản",
  TEACHER_APPROVED: "Duyệt giáo viên",
  TEACHER_REJECTED: "Từ chối giáo viên",
  CLASSROOM_CREATED: "Tạo lớp học",
  STUDENT_ADDED_TO_CLASSROOM: "Thêm học sinh vào lớp",
  STUDENT_REMOVED_FROM_CLASSROOM: "Xóa học sinh khỏi lớp",
  CLASS_SESSION_CREATED: "Tạo buổi học",
  ATTENDANCE_SAVED: "Lưu điểm danh",
  ABSENCE_REQUESTED: "Gửi đơn xin vắng",
  ABSENCE_APPROVED: "Duyệt đơn xin vắng",
  ABSENCE_REJECTED: "Từ chối đơn xin vắng",
  GUARDIAN_LINK_REQUESTED: "Yêu cầu liên kết phụ huynh",
  GUARDIAN_LINK_APPROVED: "Duyệt liên kết phụ huynh",
  GUARDIAN_LINK_REJECTED: "Từ chối liên kết phụ huynh",
  GUARDIAN_LINK_REVOKED: "Thu hồi liên kết phụ huynh",
  LESSON_CREATED: "Tạo bài học",
  LESSON_UPDATED: "Cập nhật bài học",
  LESSON_PUBLISHED: "Xuất bản bài học",
  LESSON_ARCHIVED: "Lưu trữ bài học",
  LESSON_ATTACHMENT_UPLOADED: "Tải tài liệu bài học",
  LESSON_ATTACHMENT_DELETED: "Xóa tài liệu bài học",
  ASSIGNMENT_CREATED: "Tạo bài tập",
  ASSIGNMENT_PUBLISHED: "Xuất bản bài tập",
  ASSIGNMENT_CLOSED: "Đóng bài tập",
  ASSIGNMENT_ARCHIVED: "Lưu trữ bài tập",
  ASSIGNMENT_DELETED: "Xóa bài tập",
  QUICK_QUIZ_GENERATED: "Tạo Quick Quiz",
  QUICK_QUIZ_REGENERATED: "Tạo lại Quick Quiz",
  QUICK_QUIZ_PUBLISHED: "Xuất bản Quick Quiz",
  ASSIGNMENT_LISTENING_TRACK_CREATED: "Thêm đoạn Listening",
  ASSIGNMENT_LISTENING_TRACK_UPDATED: "Cập nhật đoạn Listening",
  ASSIGNMENT_LISTENING_TRACK_DELETED: "Xóa đoạn Listening",
  ASSIGNMENT_LISTENING_AUDIO_UPLOADED: "Tải audio Listening",
  ASSIGNMENT_READ_ALOUD_ENABLED: "Bật Speaking",
  ASSIGNMENT_READ_ALOUD_UPDATED: "Cập nhật Speaking",
  ASSIGNMENT_READ_ALOUD_DISABLED: "Tắt Speaking",
  ASSIGNMENT_READ_ALOUD_GRADED: "Chấm Speaking",
  WRITING_TASK_CREATED: "Bật Writing",
  WRITING_TASK_UPDATED: "Cập nhật Writing",
  ESSAY_GRADED: "Chấm bài Essay",
  TRANSLATION_GRADED: "Chấm bài dịch",
};

const entityLabels: Record<string, string> = {
  User: "Tài khoản",
  TeacherProfile: "Hồ sơ giáo viên",
  Classroom: "Lớp học",
  ClassSession: "Buổi học",
  AbsenceRequest: "Đơn xin vắng",
  StudentGuardian: "Liên kết phụ huynh",
  Lesson: "Bài học",
  LessonAttachment: "Tài liệu bài học",
  Assignment: "Bài tập",
  AssignmentListeningTrack: "Đoạn Listening",
  AssignmentReadAloudTask: "Phần Speaking",
  AssignmentReadAloudSubmission: "Bài Speaking đã nộp",
  AssignmentWritingTask: "Phần Writing",
  WritingSubmission: "Bài Writing đã nộp",
  RefreshTokenFamily: "Phiên đăng nhập",
};

const detailLabels: Record<string, string> = {
  assignmentId: "Bài tập",
  classroomId: "Lớp học",
  lessonId: "Bài học",
  sessionId: "Buổi học",
  studentId: "Học sinh",
  attemptId: "Lượt làm",
  sourceLessonIds: "Bài học nguồn",
  sourceWordCount: "Số từ nguồn",
  questionCount: "Số câu",
  generationMode: "Nguồn tạo",
  fileName: "Tên tệp",
  fileSize: "Dung lượng",
  fileType: "Định dạng",
  score: "Điểm",
  maxScore: "Thang điểm",
  correctCount: "Số câu đúng",
  totalItems: "Tổng số câu",
  email: "Email",
  roles: "Vai trò",
  reason: "Lý do",
  rejectionNote: "Lý do từ chối",
  changedFields: "Thông tin thay đổi",
  enabled: "Trạng thái",
  type: "Loại",
};

const roleLabels: Record<string, string> = {
  ADMIN: "Quản trị viên",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
  GUARDIAN: "Phụ huynh",
};

const fieldLabels: Record<string, string> = {
  fullName: "Họ tên",
  phone: "Số điện thoại",
  email: "Email",
  status: "Trạng thái",
};

const idKeys = new Set(["assignmentId", "classroomId", "lessonId", "sessionId", "studentId", "attemptId"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shortAuditId(value: string) {
  return uuidPattern.test(value) ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function auditActionLabel(action: string) {
  return actionLabels[action] ?? action.toLocaleLowerCase().replaceAll("_", " ").replace(/^./u, (character) => character.toLocaleUpperCase());
}

export function auditEntityLabel(entityType: string) {
  return entityLabels[entityType] ?? entityType;
}

function metadataRecord(value: unknown): AuditMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AuditMetadata : {};
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Không có";
  if (key === "fileSize" && typeof value === "number") return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (key === "fileType" && typeof value === "string") return value.replace(/^audio\//, "").toLocaleUpperCase();
  if (key === "generationMode" && typeof value === "string") return value === "AI" ? "AI" : value === "LOCAL" ? "Tự động nội bộ" : "Thủ công";
  if (key === "enabled" && typeof value === "boolean") return value ? "Bật" : "Tắt";
  if (key === "roles" && Array.isArray(value)) return value.map((role) => roleLabels[String(role)] ?? String(role)).join(", ");
  if (key === "changedFields" && Array.isArray(value)) return value.map((field) => fieldLabels[String(field)] ?? String(field)).join(", ");
  if (key === "sourceLessonIds" && Array.isArray(value)) return `${value.length} bài học`;
  if (idKeys.has(key) && typeof value === "string") return shortAuditId(value);
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? shortAuditId(item) : String(item)).join(", ");
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object") return "Dữ liệu bổ sung";
  return String(value);
}

export function auditDetails(metadata: unknown) {
  return Object.entries(metadataRecord(metadata)).map(([key, value]) => ({
    key,
    label: detailLabels[key] ?? key,
    value: formatValue(key, value),
  }));
}
