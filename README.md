# Ms Ngân English

Nền tảng quản lý giảng dạy tiếng Anh cho giáo viên, học sinh và phụ huynh.

## Trạng thái phát triển

Giai đoạn 1 — Nền tảng:

- [x] Step 1A: khởi tạo repository và giao diện đăng nhập/đăng ký responsive.
- [x] Step 1B: PostgreSQL local, Prisma schema và migration tài khoản.
- [x] Step 1C: API đăng ký, xác minh email, đăng nhập, refresh token và đăng xuất.
- [x] Step 1D: RBAC và dashboard cho Admin, Teacher, Student và Guardian.
- [x] Step 1E: test RBAC, authorization và gia cố các trường hợp security biên.

Giai đoạn 2 — Quản lý lớp học:

- [x] Step 2A: giáo viên tạo lớp, tìm và quản lý học sinh trong lớp.
- [x] Step 2B: lịch học, buổi học, điểm danh và xin vắng mặt.
- [x] Step 2C: liên kết phụ huynh với học sinh và quyền xem dữ liệu.
- [x] Step 2D: Student dashboard, lịch học, deadline xin vắng và thống kê chuyên cần theo tháng.
- [x] Step 2E: quản trị tài khoản, duyệt giáo viên, lớp học và audit log.
- [x] Step 2F: quản lý bài học theo buổi và tài liệu đính kèm.
- [x] Step 2G.1: bài tập từ vựng, ngữ pháp, đọc hiểu, autosave và chấm điểm tự động.
- [x] Step 2G.1b: ghi âm đọc thành tiếng, chấm riêng thang 10 và giao diện quản lý bài tập.
- [x] Step 2G.5a: Quick Vocabulary Quiz với OpenAI tùy chọn, fallback nội bộ và bảng xếp hạng.

Giai đoạn 3 — Triển khai:

- [x] Step 3A: tạo repository GitHub và đẩy phiên bản nền tảng đầu tiên.
- [x] Step 3B: Docker production, Caddy HTTPS, CI và workflow deploy Ubuntu.
- [ ] Step 3C: chuẩn bị Ubuntu, PostgreSQL riêng, DNS và GitHub Environment.
- [ ] Step 3D: deploy production lần đầu và kiểm tra vận hành.

## Chạy cục bộ

Yêu cầu Node.js 22 trở lên và pnpm.

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate:deploy
```

Chạy hai dịch vụ ở hai terminal:

```bash
pnpm api:dev
pnpm dev
```

Web chạy tại `http://localhost:3000`, API chạy tại `http://localhost:4000`.

## Authentication API

- `POST /auth/register`: đăng ký Teacher, Student hoặc Guardian.
- `POST /auth/verify-email`: kích hoạt tài khoản bằng token xác minh.
- `POST /auth/login`: trả access token và đặt refresh token trong cookie HttpOnly.
- `POST /auth/refresh`: xoay vòng refresh token và cấp access token mới.
- `POST /auth/logout`: thu hồi refresh token hiện tại.
- `GET /auth/me`: đọc tài khoản từ Bearer access token.

Trong local, `AUTH_EXPOSE_DEV_TOKENS=true` cho phép giao diện hiển thị nút xác minh email mà chưa cần tích hợp dịch vụ gửi mail. Phải đặt thành `false` ở production.

## RBAC và dashboard

Mọi endpoint dashboard đều yêu cầu Bearer access token. Sai vai trò trả `403 Forbidden`.

- `GET /dashboard/overview`: dashboard theo vai trò chính của tài khoản.
- `GET /dashboard/teacher/attendance?month=YYYY-MM`: báo cáo chuyên cần và số lượt học tính phí theo tháng của Teacher.
- `GET /dashboard/student/attendance?month=YYYY-MM`: báo cáo chuyên cần theo tháng và theo lớp của Student.
- `GET /dashboard/teaching`: Teacher hoặc Admin.
- `GET /dashboard/learning`: Student hoặc Admin.
- `GET /dashboard/guardian`: Guardian hoặc Admin.
- `GET /dashboard/administration`: chỉ Admin.

Admin không được đăng ký qua API công khai. Để tạo hoặc đổi mật khẩu Admin local, điền các biến `SEED_ADMIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_PHONE` trong `.env`, chạy:

```bash
pnpm db:seed
```

Sau khi seed thành công, đặt lại `SEED_ADMIN=false` và không commit thông tin đăng nhập.

## Gia cố bảo mật

- Access token bắt buộc đúng chữ ký, thời hạn, issuer và audience.
- Mỗi request bảo vệ đọc lại trạng thái và vai trò hiện tại; tài khoản bị khóa hoặc đổi quyền có hiệu lực ngay.
- Refresh token được nhóm theo phiên. Khi phát hiện token cũ bị dùng lại, toàn bộ chuỗi token của đúng phiên đó bị thu hồi và ghi audit log.
- Token xác minh chỉ dùng một lần và bị từ chối khi hết hạn.
- Đăng nhập sai trả cùng một thông báo dù email có tồn tại hay không.
- DTO loại bỏ vai trò Admin công khai và từ chối trường dữ liệu không được khai báo.

## Classroom API

Các endpoint dưới đây chỉ dành cho tài khoản Teacher. Admin không tự trở thành giáo viên hoặc chủ sở hữu lớp.

- `POST /classes`: tạo lớp học và mã lớp duy nhất.
- `GET /classes`: danh sách lớp thuộc giáo viên đang đăng nhập, kèm sĩ số.
- `GET /classes/students/search?q=...`: tìm học sinh đang hoạt động bằng email, họ tên hoặc mã học sinh.
- `GET /classes/:classroomId/students`: xem danh sách học sinh của lớp.
- `POST /classes/:classroomId/students`: thêm học sinh đã đăng ký vào lớp.
- `DELETE /classes/:classroomId/students/:studentId`: loại học sinh khỏi lớp.

API luôn kiểm tra lớp có thuộc giáo viên đang đăng nhập hay không. Database giới hạn sĩ số từ 1–200, bảo vệ trạng thái thành viên và lưu audit log khi tạo lớp/thêm/xóa học sinh.

## Session, attendance và absence API

Endpoint dành riêng cho Teacher và chỉ cho phép truy cập lớp thuộc giáo viên đó:

- `POST /classes/:classroomId/sessions`: lên lịch một buổi học.
- `GET /classes/:classroomId/sessions`: xem các buổi học của lớp.
- `GET /sessions/:sessionId/attendance`: lấy bảng điểm danh và đơn xin vắng.
- `PUT /sessions/:sessionId/attendance`: lưu trạng thái có mặt, vắng, đi muộn hoặc vắng có phép.
- `PATCH /absence-requests/:requestId/review`: duyệt hoặc từ chối đơn xin vắng.

Endpoint dành riêng cho Student:

- `GET /student/sessions`: xem lịch học, trạng thái chuyên cần và đơn đã gửi.
- `POST /sessions/:sessionId/absence-requests`: xin vắng trước giờ học ít nhất 2 giờ.

Học sinh chỉ gửi được đơn cho lớp đang theo học. Một học sinh chỉ có một đơn trên mỗi buổi; đơn được duyệt tự tạo bản ghi `EXCUSED`. Chỉ buổi vắng được duyệt và có điểm danh `EXCUSED` mới được loại khỏi số lượt tính phí; đơn bị từ chối vẫn được tính phí sau khi buổi học hoàn thành. Mọi thao tác tạo buổi, điểm danh, xin vắng và duyệt đơn đều được ghi audit log.

## Guardian links API

Liên kết mới luôn bắt đầu ở trạng thái `PENDING`. Phụ huynh chỉ xem được dữ liệu
sau khi chính học sinh chấp thuận; API trả `404` cho tài khoản không sở hữu liên
kết để tránh lộ dữ liệu học tập.

Endpoint dành cho Guardian:

- `POST /guardian/student-links`: gửi yêu cầu bằng email học sinh và quan hệ.
- `GET /guardian/student-links`: xem yêu cầu và học sinh đã liên kết.
- `DELETE /guardian/student-links/:studentId`: hủy yêu cầu hoặc thu hồi liên kết.
- `GET /guardian/students/:studentId/overview`: xem lớp, lịch và chuyên cần.

Endpoint dành cho Student:

- `GET /student/guardian-links`: xem yêu cầu liên kết phụ huynh.
- `PATCH /student/guardian-links/:guardianId`: chấp thuận hoặc từ chối.
- `DELETE /student/guardian-links/:guardianId`: thu hồi quyền của phụ huynh.

Liên kết cũ được migration giữ ở trạng thái `ACTIVE`. Liên kết đầu tiên được học
sinh chấp thuận tự trở thành liên hệ chính. Tạo, xác nhận, từ chối và thu hồi
liên kết đều được ghi audit log.

## PostgreSQL local

File `compose.yaml` tạo PostgreSQL chỉ lắng nghe tại `127.0.0.1:5432`.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate:deploy
```

Các bảng hiện có:

- `users`, `user_roles`
- `student_profiles`, `teacher_profiles`, `guardian_profiles`
- `student_guardians`
- `refresh_tokens`, `verification_tokens`
- `classrooms`, `class_enrollments`
- `class_sessions`, `attendance_records`, `absence_requests`
- `lessons`, `lesson_attachments`
- `assignments`, `assignment_passages`, `assignment_questions`
- `assignment_attempts`, `assignment_answers`
- `assignment_read_aloud_tasks`, `assignment_read_aloud_submissions`, `assignment_audio_attachments`
- `assignment_listening_tracks`, `assignment_listening_playbacks`
- `assignment_writing_tasks`, `writing_submissions`, `writing_translation_items`, `writing_translation_answers`
- `audit_logs`

Prisma ORM 7 dùng PostgreSQL driver adapter tại `server/database/client.ts`.
Email dùng kiểu `CITEXT`, nên uniqueness không phân biệt chữ hoa/chữ thường.

## Quick Vocabulary Quiz

Giáo viên mở **Quản lý bài tập → Tạo Quick Quiz**, chọn lớp, nguồn 1/3/5 buổi gần nhất hoặc một buổi cụ thể, số câu, số lượt và giới hạn thời gian. Quiz được lưu dưới dạng Assignment `QUIZ` ở trạng thái `DRAFT`; giáo viên phải kiểm tra, có thể sửa/xóa/sắp xếp câu hỏi rồi mới xuất bản.

Lesson hiện lưu từ vựng dưới dạng văn bản. Quick Quiz chỉ đọc các dòng có cấu trúc an toàn sau, không suy đoán văn bản tự do:

```text
sunny | có nắng | It is sunny today.
rainy => có mưa => It is rainy today.
windy<TAB>có gió<TAB>It is windy today.
```

API:

- `POST /quick-quizzes`: tạo bản nháp Quick Quiz cho giáo viên đã được duyệt.
- `POST /quick-quizzes/:assignmentId/regenerate`: thay câu hỏi của bản nháp chưa có lượt làm.
- `GET /assignments/:assignmentId/leaderboard`: bảng xếp hạng theo lần tốt nhất; đúng nhiều hơn trước, thời gian ngắn hơn sau.

Tích hợp OpenAI là tùy chọn và chỉ chạy ở backend khi tạo câu hỏi. Hệ thống dùng một request Responses API với Structured Output, kiểm tra lại dữ liệu trên máy chủ rồi mới lưu. Thiếu key, tắt tính năng, timeout, lỗi mạng/quota/model hoặc output không hợp lệ đều tự chuyển sang bộ tạo nội bộ xác định; việc làm bài, chấm điểm và xếp hạng không gọi AI.

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
AI_QUIZ_ENABLED=false
AI_QUIZ_TIMEOUT_MS=45000
```

Không dùng tiền tố `NEXT_PUBLIC_` và không đưa key vào frontend. Ứng dụng khởi động bình thường khi không có `OPENAI_API_KEY`.

## Listening

Trong bản nháp bài tập, giáo viên có thể bật **Listening**, tạo một hoặc nhiều đoạn nghe, tải file MP3/M4A/WAV/OGG/WebM (tối đa 10 MB), đặt số lượt nghe, cho phép hoặc không cho phép tua và lựa chọn chỉ hiện transcript sau khi học sinh nộp bài. Mỗi đoạn nghe phải có file audio và ít nhất một câu hỏi trước khi bài tập được xuất bản.

Listening dùng chung Assignment, Attempt, Answer và bộ chấm điểm xác định hiện có. Các dạng được hỗ trợ là trắc nghiệm, đúng/sai, điền từ và nối cặp. Lượt nghe và thời gian làm bài được kiểm tra ở backend; bộ đếm trên trình duyệt chỉ dùng để hiển thị.

Audio Listening và Speaking được lưu dưới `ASSIGNMENT_UPLOAD_DIR` (hai namespace `listening/` và `speaking/`), không lưu binary trong PostgreSQL và không phục vụ công khai. API xác thực quyền trước khi phát file. Lớp `AssignmentAudioStorageService` tách nghiệp vụ khỏi filesystem để có thể bổ sung driver S3/MinIO sau này; phiên bản hiện tại mới kích hoạt local Docker volume, chưa có driver object storage.

## Kiểm tra

```bash
pnpm build
pnpm test
pnpm api:typecheck
pnpm typecheck
pnpm lint
```

Không commit file `.env`, mật khẩu, token hoặc thông tin kết nối production.

## Production trên Ubuntu

### Sao lưu dữ liệu và tệp tải lên

Tệp bài học cùng audio Speaking/Listening được lưu trong các Docker named volume, không nằm trong PostgreSQL. Vì vậy một bản `pg_dump` không phải là bản sao lưu đầy đủ. Khi sao lưu production cần giữ cả:

1. PostgreSQL dump.
2. Bản archive của volume `lesson_uploads`.
3. Bản archive của volume `assignment_uploads`.

Ví dụ khái niệm (thay tên volume thực tế và thư mục backup theo Compose project trên máy chủ):

```bash
docker run --rm \
  -v <lesson_volume_name>:/source:ro \
  -v <backup_directory>:/backup \
  alpine \
  tar czf /backup/lesson_uploads_<timestamp>.tar.gz -C /source .

docker run --rm \
  -v <assignment_volume_name>:/source:ro \
  -v <backup_directory>:/backup \
  alpine \
  tar czf /backup/assignment_uploads_<timestamp>.tar.gz -C /source .
```

Khi restore, phục hồi PostgreSQL và cả hai volume cùng một mốc thời gian. Không giải nén volume vào thư mục public và không phục vụ trực tiếp volume qua Caddy; tải xuống/phát audio luôn đi qua API đã xác thực.

Ví dụ restore volume vào volume trống (thay đúng tên volume và tệp backup):

```bash
docker run --rm \
  -v <lesson_volume_name>:/target \
  -v <backup_directory>:/backup:ro \
  alpine \
  sh -c 'cd /target && tar xzf /backup/lesson_uploads_<timestamp>.tar.gz'

docker run --rm \
  -v <assignment_volume_name>:/target \
  -v <backup_directory>:/backup:ro \
  alpine \
  sh -c 'cd /target && tar xzf /backup/assignment_uploads_<timestamp>.tar.gz'
```

Production dùng hai Docker image độc lập cho Web và API, Caddy làm HTTPS reverse
proxy, còn PostgreSQL chạy ngoài application server. `main` luôn là nguồn code
ổn định; workflow `CI` kiểm tra mọi pull request và workflow `Deploy production`
được chạy thủ công để build/publish image lên GHCR rồi cập nhật máy chủ.

Các file chính:

- `Dockerfile.web`: Vinext standalone, chạy bằng user không đặc quyền.
- `Dockerfile.api`: NestJS/Prisma, chạy bằng user không đặc quyền.
- `compose.prod.yaml`: Web, API và Caddy; không chứa PostgreSQL.
- `Caddyfile`: domain Web/API và HTTPS tự động.
- `.env.production.example`: mẫu biến production, không chứa secret thật.
- `deploy/deploy.sh`: migration, rollout, health check và khôi phục image trước.
- `.github/workflows/ci.yml`: build/test/typecheck/lint.
- `.github/workflows/deploy.yml`: publish GHCR và deploy qua SSH.

Hướng dẫn chuẩn bị server, GitHub Environment, secrets, DNS và vận hành nằm tại
[`deploy/README.md`](deploy/README.md).
