# Apartment Split — Ứng dụng chia tiền thuê nhà

Ứng dụng web chạy hoàn toàn ở local (chỉ cần mở `index.html`), không backend, không database. Dữ liệu lưu trong `localStorage` của trình duyệt.

## Tính năng

- **Dashboard**: tổng chi tiêu, chi tiêu chung, chi tiêu mỗi người, và kết quả cân đối cuối cùng ("X cần chuyển cho Y bao nhiêu").
- **Thêm/Sửa/Xóa chi tiêu**: ngày, mô tả, danh mục, số tiền, người trả, loại (Chung/Cá nhân), người chịu (nếu Cá nhân), ghi chú.
- **Bộ lọc**: theo tháng, danh mục, người trả, loại chi tiêu, và tìm kiếm từ khóa.
- **Thống kê**: biểu đồ cột theo danh mục, biểu đồ donut theo người, biểu đồ cột theo tháng — vẽ bằng Canvas thuần, không thư viện.
- **Export/Import JSON**, xóa toàn bộ dữ liệu.
- **Dark mode**, toast notification, hộp thoại xác nhận trước khi xóa, trạng thái rỗng (empty state).
- Phím tắt: `N` để thêm nhanh, `Esc` để đóng modal.

## Cách chạy

Mở trực tiếp file `index.html` bằng trình duyệt (Chrome/Safari/Firefox đều được). Không cần cài đặt gì thêm.

## Thuật toán chia tiền

- **Chi tiêu chung**: chia đôi 50/50 cho cả hai người, bất kể ai trả.
- **Chi tiêu cá nhân**: tính toàn bộ cho người sở hữu (owner), bất kể ai trả.
- Với mỗi người, `balance = số tiền đã trả - số tiền phải chịu`. Người có balance dương sẽ được người kia hoàn lại đúng phần chênh lệch.

## Cấu trúc dữ liệu (localStorage)

- `expenseTracker_expenses`: mảng các khoản chi (xem chi tiết field trong `script.js` — StorageModule).
- `expenseTracker_config`: tên 2 người, màu sắc, danh mục, chế độ dark mode.

## Cấu trúc thư mục

```
expense-tracker/
├── index.html
├── style.css
├── script.js
├── assets/
│   ├── icons/
│   └── images/
└── README.md
```

## Hướng phát triển thêm

- Đồng bộ dữ liệu qua nhiều thiết bị (cần backend).
- Thêm nhiều hơn 2 người trong nhà.
- Xuất báo cáo PDF theo tháng.
- Thêm ảnh hóa đơn đính kèm mỗi khoản chi.
