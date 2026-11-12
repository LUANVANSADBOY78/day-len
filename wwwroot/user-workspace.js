const userMessage = document.querySelector('#message');
const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Không thể thực hiện yêu cầu.');
  return data;
};

const form = document.querySelector('#booking-form');
let currentUser = null;
let currentPatientProfile = null;
let doctors = [];
let currentAppointments = [];
let allRecordsCache = [];

async function loadUser() {
  currentUser = await request('/api/auth/me');
  document.querySelector('#welcome').textContent = `Xin chào ${currentUser.fullName}. Theo dõi lịch hẹn & sổ sức khỏe điện tử của bạn.`;
  await loadPatientProfile();
  updateLoyaltyPointsDisplay();
}

async function loadPatientProfile() {
  try {
    currentPatientProfile = await request('/api/patients/me');
  } catch {
    currentPatientProfile = null;
  }
  updateLoyaltyPointsDisplay();
}

function updateLoyaltyPointsDisplay() {
  const points = (currentUser?.rewardPoints ?? currentPatientProfile?.rewardPoints ?? 0);
  const pointsEl = document.querySelector('#loyalty-points-val');
  const pointsMoneyEl = document.querySelector('#loyalty-points-money');
  if (pointsEl) pointsEl.textContent = points.toLocaleString('vi-VN');
  if (pointsMoneyEl) pointsMoneyEl.textContent = (points * 1000).toLocaleString('vi-VN');

  const maxPointsInput = document.querySelector('#booking-points-input');
  if (maxPointsInput) {
    maxPointsInput.max = Math.min(points, 100);
  }
}

async function loadDoctors() {
  doctors = await request('/api/doctors', { cache: 'no-store' });
  const specialties = [...new Set(doctors.map(item => item.specialty))];
  const specSelect = document.querySelector('#specialty');
  specSelect.innerHTML = '<option value="">Chọn chuyên khoa</option>' + specialties.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  
  specSelect.addEventListener('change', event => {
    updateDoctorDropdown(event.target.value);
  });

  // Tự động chọn nếu có query params (ví dụ Chatbot điều hướng tới)
  const urlParams = new URLSearchParams(window.location.search);
  const paramSpec = urlParams.get('specialty');
  const paramDocId = urlParams.get('doctorId');

  if (paramSpec) {
    for (let opt of specSelect.options) {
      if (opt.value.toLowerCase().includes(paramSpec.toLowerCase())) {
        specSelect.value = opt.value;
        updateDoctorDropdown(opt.value);
        break;
      }
    }
  }

  if (paramDocId) {
    setTimeout(() => {
      document.querySelector('#doctor-id').value = paramDocId;
      renderSelectedDoctorProfile();
    }, 150);
  }
}

function updateDoctorDropdown(specValue) {
  const filtered = doctors.filter(item => item.specialty === specValue);
  document.querySelector('#doctor-id').innerHTML = '<option value="">Chọn bác sĩ</option>' + 
    filtered.map(item => `<option value="${item.id}">${escapeHtml(item.fullName)} · ${escapeHtml(item.degree || 'Bác sĩ')} · ${item.experienceYears || 0} năm kinh nghiệm</option>`).join('');
  renderSelectedDoctorProfile();
}

function renderSelectedDoctorProfile() {
  const container = document.querySelector('#doctor-profile-preview');
  if (!container) return;
  const doctor = doctors.find(item => item.id === Number(document.querySelector('#doctor-id').value));
  if (!doctor) {
    container.innerHTML = '';
    return;
  }

  const image = doctor.profileImageUrl
    ? `<img src="${escapeHtml(doctor.profileImageUrl)}" alt="Ảnh ${escapeHtml(doctor.fullName)}" style="width:96px;height:96px;object-fit:cover;border-radius:50%;">`
    : '<div style="width:96px;height:96px;border-radius:50%;background:#e2e8f0;display:grid;place-items:center;color:#64748b;">Chưa có ảnh</div>';
  container.innerHTML = `
    <article style="display:flex;align-items:center;gap:16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      ${image}
      <div>
        <strong style="font-size:1.05rem;">${escapeHtml(doctor.fullName)}</strong>
        <p style="margin:5px 0;color:#475569;">${escapeHtml(doctor.specialty)} · ${escapeHtml(doctor.room)}</p>
        <p style="margin:0;color:#334155;">${escapeHtml(doctor.degree || 'Chưa cập nhật bằng cấp')} · ${doctor.experienceYears || 0} năm kinh nghiệm</p>
      </div>
    </article>
  `;
  const profileImage = container.querySelector('img');
  profileImage?.addEventListener('error', () => {
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Chưa có ảnh';
    placeholder.style.cssText = 'width:96px;height:96px;border-radius:50%;background:#e2e8f0;display:grid;place-items:center;color:#64748b;';
    profileImage.replaceWith(placeholder);
  }, { once: true });
}

document.querySelector('#doctor-id')?.addEventListener('change', renderSelectedDoctorProfile);
function getStatusBadge(status, queueNumber) {
  switch (status) {
    case 'Pending': return '<span class="tag pending">⏳ Chờ duyệt</span>';
    case 'Confirmed': return '<span class="tag confirmed">✓ Đã duyệt</span>';
    case 'CheckedIn': return `<span class="tag checkedin">🏥 Đã Check-in (STT: #${queueNumber || '---'})</span>`;
    case 'Completed': return '<span class="tag completed">★ Đã khám xong</span>';
    case 'Cancelled': return '<span class="tag cancelled">✕ Đã hủy</span>';
    case 'NoShow': return '<span class="tag cancelled">Không đến khám</span>';
    case 'NeedReschedule': return '<span class="tag reschedule">⚠ Cần đổi lịch khám</span>';
    default: return `<span class="tag confirmed">${escapeHtml(status)}</span>`;
  }
}

async function loadAppointments() {
  currentAppointments = await request('/api/appointments');
  const container = document.querySelector('#appointments');

  // Check live queue tracker banner
  const checkedInAppt = currentAppointments.find(a => a.status === 'CheckedIn');
  const banner = document.querySelector('#live-queue-banner');
  if (checkedInAppt && banner) {
    document.querySelector('#live-queue-stt').textContent = `Số thứ tự khám của bạn: #${checkedInAppt.queueNumber || '---'}`;
    const doc = doctors.find(d => d.id === checkedInAppt.doctorId);
    const docName = doc ? doc.fullName : `Bác sĩ #${checkedInAppt.doctorId}`;
    const room = doc ? doc.room : 'Phòng khám';
    document.querySelector('#live-queue-desc').textContent = `Bạn đã check-in thành công tại quầy lễ tân! Bác sĩ phụ trách: ${docName} (${room}). Vui lòng theo dõi loa gọi hoặc màn hình tại sảnh chờ.`;
    banner.style.display = 'flex';
  } else if (banner) {
    banner.style.display = 'none';
  }

  if (!currentAppointments || !currentAppointments.length) {
    container.innerHTML = '<p class="label">Bạn chưa có lịch hẹn nào.</p>';
    return;
  }

  container.innerHTML = currentAppointments.map(item => {
    const doc = doctors.find(d => d.id === item.doctorId);
    const docName = doc ? doc.fullName : `Bác sĩ #${item.doctorId}`;
    const canCancel = item.status === 'Pending' || item.status === 'Confirmed' || item.status === 'NeedReschedule';
    const canReschedule = item.status === 'Pending' || item.status === 'Confirmed' || item.status === 'NeedReschedule';
    const isCompleted = item.status === 'Completed';
    const transfer = item.paymentInstructions;
    const paymentDetails = transfer
      ? `<div style="margin-top:8px;padding:10px;background:#eff6ff;border-radius:8px;color:#1e3a8a;">
          <strong>Chuyển khoản phí giữ chỗ</strong><br>
          Ngân hàng: ${escapeHtml(transfer.bankName)} · Tài khoản: ${escapeHtml(transfer.accountNumber)}<br>
          Chủ tài khoản: ${escapeHtml(transfer.accountName)} · Số tiền: ${Number(transfer.amount).toLocaleString('vi-VN')}đ<br>
          Nội dung: <strong>${escapeHtml(transfer.transferDescription)}</strong>
        </div>`
      : '';
    const paymentStatus = item.bookingFeeIsPaid
      ? item.bookingFeePaymentMethod === 'RewardPoints' ? 'Đã thanh toán bằng điểm' : 'Đã nhận chuyển khoản'
      : item.bookingFeeRefundDue ? 'Đang chờ hoàn phí'
      : item.bookingFeeRefunded ? 'Đã hoàn phí giữ chỗ'
      : item.bookingFeeForfeited ? 'Phí giữ chỗ không được hoàn theo chính sách'
      : item.bookingSource === 'Online' && item.bookingFee > item.discountAmount ? 'Chưa thanh toán phí giữ chỗ' : '';

    let actionBtns = '';
    if (canReschedule) {
      actionBtns += `<button class="btn-action-sm btn-reschedule" onclick="openRescheduleModal(${item.id})">🗓️ Đổi lịch</button>`;
    }
    if (canCancel) {
      actionBtns += `<button class="btn-action-sm btn-cancel" onclick="cancelAppointment(${item.id})">✕ Hủy</button>`;
    }
    if (isCompleted) {
      actionBtns += `<button class="btn-action-sm btn-review" onclick="openReviewModal(${item.id}, ${item.doctorId}, '${escapeHtml(docName)}')">⭐ Đánh giá</button>`;
    }

    return `
      <div class="item">
        <div>
          <strong>Lịch hẹn #${item.id} ${item.queueNumber ? `· STT #${item.queueNumber}` : ''}</strong>
          <small>📅 ${new Date(item.appointmentDate).toLocaleString('vi-VN')} · Bác sĩ: ${escapeHtml(docName)}<br>Lý do: ${escapeHtml(item.reason)}${paymentStatus ? `<br>Phí giữ chỗ: ${paymentStatus}` : ''}</small>
          ${paymentDetails}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${getStatusBadge(item.status, item.queueNumber)}
          ${actionBtns}
        </div>
      </div>
    `;
  }).join('');
}

async function loadMedicalRecords() {
  const container = document.querySelector('#medical-records-list');
  try {
    const records = await request('/api/medical-records');
    if (!records || !records.length) {
      container.innerHTML = '<p class="label">Chưa có lịch sử bệnh án.</p>';
      return;
    }

    const recordsWithPrescriptions = await Promise.all(records.map(async rec => {
      const prescriptions = await request(`/api/medical-records/${rec.id}/prescriptions`).catch(() => []);
      return { ...rec, prescriptions };
    }));
    allRecordsCache = recordsWithPrescriptions;

    container.innerHTML = recordsWithPrescriptions.map(rec => {
      const doc = doctors.find(d => d.id === rec.doctorId);
      const docName = doc ? doc.fullName : `Bác sĩ #${rec.doctorId}`;

      let vitalsHtml = '';
      if (rec.bloodPressure || rec.heartRate || rec.temperature || rec.weight) {
        vitalsHtml = `
          <div style="background:#f1f5f9;padding:8px 12px;border-radius:8px;margin:8px 0;font-size:0.85rem;color:#334155;">
            🩺 <b>Dấu hiệu sinh tồn:</b> 
            ${rec.bloodPressure ? `Huyết áp: <b>${escapeHtml(rec.bloodPressure)}</b> | ` : ''}
            ${rec.heartRate ? `Nhịp tim: <b>${escapeHtml(rec.heartRate)}</b> | ` : ''}
            ${rec.temperature ? `Nhiệt độ: <b>${escapeHtml(rec.temperature)}</b> | ` : ''}
            ${rec.weight ? `Cân nặng: <b>${escapeHtml(rec.weight)}</b>` : ''}
          </div>
        `;
      }

      const presHtml = rec.prescriptions && rec.prescriptions.length ? rec.prescriptions.map(p => `
        <div class="prescription-box">
          <strong>💊 Đơn thuốc chỉ định:</strong><br>
          <div style="white-space:pre-wrap;margin:4px 0;">${escapeHtml(p.medicines)}</div>
          <strong style="color:#0284c7;">📋 Hướng dẫn sử dụng:</strong> ${escapeHtml(p.instructions)}
        </div>
      `).join('') : '<p style="font-size:0.85rem;color:#94a3b8;margin-top:6px;">Không có đơn thuốc đính kèm.</p>';

      return `
        <div class="record-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h4>Hồ sơ khám bệnh #${rec.id} · Bác sĩ: ${escapeHtml(docName)}</h4>
              <div class="record-meta">Ngày khám: ${new Date(rec.examinedAt).toLocaleString('vi-VN')}</div>
            </div>
            <button class="btn-action-sm btn-print" onclick="openPrintModal(${rec.id})">
              🖨️ Xem & In bệnh án
            </button>
          </div>

          ${vitalsHtml}

          <p><strong>Triệu chứng lâm sàng:</strong> ${escapeHtml(rec.symptoms || 'Không ghi nhận')}</p>
          <p><strong>Chẩn đoán xác định:</strong> <span style="color:#059669;font-weight:700;">${escapeHtml(rec.diagnosis || 'Chưa cập nhật')}</span></p>
          ${rec.treatmentPlan ? `<p><strong>Hướng điều trị:</strong> ${escapeHtml(rec.treatmentPlan)}</p>` : ''}
          ${rec.labTests ? `<p><strong>Chỉ định Cận lâm sàng:</strong> ${escapeHtml(rec.labTests)}</p>` : ''}
          ${rec.followUpDate ? `<p><strong>Hẹn tái khám vào ngày:</strong> <b style="color:#ea580c;">${new Date(rec.followUpDate).toLocaleDateString('vi-VN')}</b></p>` : ''}
          ${rec.notes ? `<p><strong>Ghi chú / Lời dặn của bác sĩ:</strong> <i>${escapeHtml(rec.notes)}</i></p>` : ''}
          ${presHtml}
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p class="label">Chưa có kết quả khám.</p>';
  }
}
window.loadAppointments = loadAppointments;
window.loadMedicalRecords = loadMedicalRecords;

window.cancelAppointment = async id => {
  const appointment = currentAppointments.find(item => item.id === id);
  const isRefundable = appointment?.bookingFeeIsPaid &&
    appointment.bookingFeePaymentMethod === 'BankTransfer' &&
    new Date(appointment.appointmentDate).getTime() - Date.now() >= 24 * 60 * 60 * 1000;
  const policy = appointment?.bookingFeeIsPaid
    ? isRefundable
      ? 'Phí giữ chỗ sẽ được đưa vào danh sách chờ hoàn; nhân viên sẽ chuyển khoản hoàn.'
      : 'Phí giữ chỗ không được hoàn khi hủy muộn.'
    : 'Điểm đã dùng sẽ được trả lại.';
  if (!confirm(`Bạn có chắc muốn hủy lịch hẹn này? ${policy}`)) return;
  try {
    await request(`/api/appointments/${id}/cancel`, { method: 'PATCH' });
    await loadAppointments();
    userMessage.textContent = isRefundable
      ? 'Đã hủy lịch. Phí giữ chỗ đang chờ nhân viên chuyển khoản hoàn.'
      : 'Đã hủy lịch hẹn thành công.';
  } catch (error) {
    userMessage.textContent = error.message;
  }
};

/* --- CẬP NHẬT HỒ SƠ BỆNH NHÂN & BHYT --- */
window.openProfileModal = async () => {
  document.querySelector('#profile-modal').style.display = 'flex';
  document.querySelector('#profile-message').textContent = '';

  try {
    await loadPatientProfile();
    if (currentPatientProfile) {
      document.querySelector('#profile-fullname').value = currentPatientProfile.fullName || currentUser?.fullName || '';
      document.querySelector('#profile-dob').value = currentPatientProfile.dateOfBirth || '1995-01-01';
      document.querySelector('#profile-phone').value = currentPatientProfile.phone || '';
      document.querySelector('#profile-insurance').value = currentPatientProfile.insuranceNumber || '';
      document.querySelector('#profile-address').value = currentPatientProfile.address || '';
      document.querySelector('#profile-history').value = currentPatientProfile.medicalHistory || '';
    }
  } catch (err) {
    console.error('Không thể nạp hồ sơ:', err);
  }
};

window.closeProfileModal = () => {
  document.querySelector('#profile-modal').style.display = 'none';
};

document.querySelector('#profile-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.querySelector('#profile-message');
  msgEl.style.color = '#0284c7';
  msgEl.textContent = 'Đang lưu hồ sơ...';

  try {
    const payload = {
      fullName: document.querySelector('#profile-fullname').value.trim(),
      dateOfBirth: document.querySelector('#profile-dob').value,
      phone: document.querySelector('#profile-phone').value.trim(),
      insuranceNumber: document.querySelector('#profile-insurance').value.trim(),
      address: document.querySelector('#profile-address').value.trim(),
      medicalHistory: document.querySelector('#profile-history').value.trim()
    };

    await request('/api/patients/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    msgEl.style.color = '#059669';
    msgEl.textContent = '✓ Đã cập nhật hồ sơ cá nhân và số thẻ BHYT thành công!';
    await loadPatientProfile();
    setTimeout(() => {
      closeProfileModal();
    }, 1200);
  } catch (err) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = err.message;
  }
});

/* --- XEM VÀ IN BỆNH ÁN & ĐƠN THUỐC --- */
window.openPrintModal = (recordId) => {
  const rec = allRecordsCache.find(r => r.id === recordId);
  if (!rec) return;

  const doc = doctors.find(d => d.id === rec.doctorId);
  const docName = doc ? doc.fullName : `Bác sĩ #${rec.doctorId}`;

  document.querySelector('#print-doc-date').textContent = `Ngày lập: ${new Date(rec.examinedAt).toLocaleDateString('vi-VN')}`;
  
  // Thông tin bệnh nhân
  const pName = currentPatientProfile?.fullName || currentUser?.fullName || 'Bệnh nhân';
  const pDob = currentPatientProfile?.dateOfBirth ? new Date(currentPatientProfile.dateOfBirth).toLocaleDateString('vi-VN') : '—';
  const pBhyt = currentPatientProfile?.insuranceNumber || 'Không đăng ký';
  const pAddress = currentPatientProfile?.address || '—';

  document.querySelector('#print-patient-info').innerHTML = `
    <strong>Họ tên người bệnh:</strong> ${escapeHtml(pName)} · <strong>Ngày sinh:</strong> ${pDob}<br>
    <strong>Số thẻ BHYT:</strong> ${escapeHtml(pBhyt)} · <strong>Địa chỉ:</strong> ${escapeHtml(pAddress)}
  `;

  // Khám lâm sàng & sinh hiệu
  let vitalsStr = '';
  if (rec.bloodPressure || rec.heartRate || rec.temperature || rec.weight) {
    vitalsStr = `<br><b>Dấu hiệu sinh tồn:</b> HA: ${rec.bloodPressure || '—'} | Mạch: ${rec.heartRate || '—'} | Thân nhiệt: ${rec.temperature || '—'} | Cân nặng: ${rec.weight || '—'}`;
  }

  document.querySelector('#print-clinical-info').innerHTML = `
    <strong>Triệu chứng:</strong> ${escapeHtml(rec.symptoms)}<br>
    <strong>Chẩn đoán:</strong> <b style="color:#0f172a;">${escapeHtml(rec.diagnosis)}</b>
    ${rec.treatmentPlan ? `<br><strong>Hướng điều trị:</strong> ${escapeHtml(rec.treatmentPlan)}` : ''}
    ${rec.labTests ? `<br><strong>Chỉ định Cận lâm sàng:</strong> ${escapeHtml(rec.labTests)}` : ''}
    ${rec.followUpDate ? `<br><strong>Hẹn tái khám:</strong> Ngày ${new Date(rec.followUpDate).toLocaleDateString('vi-VN')}` : ''}
    ${rec.notes ? `<br><strong>Dặn dò:</strong> <i>${escapeHtml(rec.notes)}</i>` : ''}
    ${vitalsStr}
  `;

  // Đơn thuốc
  if (rec.prescriptions && rec.prescriptions.length) {
    document.querySelector('#print-prescription-info').innerHTML = rec.prescriptions.map((p, idx) => `
      <div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;margin-top:8px;">
        <strong style="color:#1e40af;">💊 ĐƠN THUỐC ĐIỆN TỬ #${p.id || idx + 1}:</strong>
        <div style="white-space:pre-wrap;margin:6px 0;font-size:0.92rem;">${escapeHtml(p.medicines)}</div>
        <small style="color:#475569;"><b>Hướng dẫn dùng:</b> ${escapeHtml(p.instructions)}</small>
      </div>
    `).join('');
  } else {
    document.querySelector('#print-prescription-info').innerHTML = '<p style="color:#94a3b8;font-style:italic;">Không có đơn thuốc chỉ định.</p>';
  }

  document.querySelector('#print-doctor-sign').textContent = docName;
  document.querySelector('#print-record-modal').style.display = 'flex';
};

window.closePrintModal = () => {
  document.querySelector('#print-record-modal').style.display = 'none';
};

/* --- MODAL ĐỔI LỊCH (RESCHEDULE) --- */
window.openRescheduleModal = (id) => {
  const appt = currentAppointments.find(a => a.id === id);
  if (!appt) return;

  const doc = doctors.find(d => d.id === appt.doctorId);
  const docName = doc ? doc.fullName : `Bác sĩ #${appt.doctorId}`;

  document.querySelector('#reschedule-appt-id').value = id;
  document.querySelector('#reschedule-info').textContent = 
    `Lịch hẹn #${id} với ${docName}. Ngày giờ hiện tại: ${new Date(appt.appointmentDate).toLocaleString('vi-VN')}.`;
  
  document.querySelector('#reschedule-new-date').value = '';
  document.querySelector('#reschedule-reason').value = '';
  document.querySelector('#reschedule-message').textContent = '';
  document.querySelector('#reschedule-modal').style.display = 'flex';
};

window.closeRescheduleModal = () => {
  document.querySelector('#reschedule-modal').style.display = 'none';
};

document.querySelector('#reschedule-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#reschedule-appt-id').value;
  const newDate = document.querySelector('#reschedule-new-date').value;
  const reason = document.querySelector('#reschedule-reason').value;
  const msgEl = document.querySelector('#reschedule-message');

  try {
    msgEl.style.color = '#0284c7';
    msgEl.textContent = 'Đang kiểm tra lịch trống và xử lý...';

    await request(`/api/appointments/${id}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newAppointmentDate: newDate,
        reason: reason
      })
    });

    closeRescheduleModal();
    await loadAppointments();
    userMessage.textContent = '✓ Đã đổi lịch khám thành công! Hệ thống đã gửi thông báo tới Bác sĩ và Lễ tân.';
  } catch (err) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = err.message;
  }
});

/* --- MODAL ĐÁNH GIÁ BÁC SĨ (REVIEWS) --- */
window.openReviewModal = (apptId, doctorId, doctorName) => {
  document.querySelector('#review-appt-id').value = apptId;
  document.querySelector('#review-doctor-id').value = doctorId;
  document.querySelector('#review-doctor-info').textContent = `Đánh giá ca khám với: ${doctorName}`;
  document.querySelector('#review-rating').value = '5';
  document.querySelector('#review-comment').value = '';
  document.querySelector('#review-message').textContent = '';
  document.querySelector('#review-modal').style.display = 'flex';
};

window.closeReviewModal = () => {
  document.querySelector('#review-modal').style.display = 'none';
};

document.querySelector('#review-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const apptId = Number(document.querySelector('#review-appt-id').value);
  const doctorId = Number(document.querySelector('#review-doctor-id').value);
  const rating = Number(document.querySelector('#review-rating').value);
  const comment = document.querySelector('#review-comment').value;
  const msgEl = document.querySelector('#review-message');

  try {
    msgEl.style.color = '#0284c7';
    msgEl.textContent = 'Đang gửi đánh giá...';

    await request('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId: doctorId,
        appointmentId: apptId,
        rating: rating,
        comment: comment
      })
    });

    closeReviewModal();
    userMessage.textContent = '✓ Cảm ơn bạn đã gửi đánh giá cho Bác sĩ!';
  } catch (err) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = err.message;
  }
});

/* --- TÍNH TOÁN ĐIỂM THƯỞNG GIẢM PHÍ GIỮ CHỖ --- */
const bookingPointsInput = document.querySelector('#booking-points-input');
if (bookingPointsInput) {
  bookingPointsInput.addEventListener('input', () => {
    const userPoints = (currentUser?.rewardPoints ?? currentPatientProfile?.rewardPoints ?? 0);
    let pts = parseInt(bookingPointsInput.value) || 0;
    if (pts < 0) pts = 0;
    if (pts > 100) pts = 100;
    if (pts > userPoints) pts = userPoints;
    bookingPointsInput.value = pts;

    const discount = pts * 1000;
    const finalFee = Math.max(0, 100000 - discount);
    const discEl = document.querySelector('#booking-discount-val');
    const finalEl = document.querySelector('#booking-final-fee');
    if (discEl) discEl.textContent = discount.toLocaleString('vi-VN');
    if (finalEl) finalEl.textContent = finalFee.toLocaleString('vi-VN');
  });
}

/* --- GỬI YÊU CẦU ĐẶT LỊCH --- */
form?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const docId = Number(document.querySelector('#doctor-id').value);
    const dateVal = document.querySelector('#appointment-date').value;
    const reasonVal = document.querySelector('#reason').value;
    const pointsUsed = parseInt(document.querySelector('#booking-points-input')?.value) || 0;

    const appointment = await request('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 0,
        doctorId: docId,
        appointmentDate: dateVal,
        reason: reasonVal,
        status: 'Pending',
        bookingFee: 100000,
        pointsUsed: pointsUsed
      })
    });
    form.reset();
    const discEl = document.querySelector('#booking-discount-val');
    const finalEl = document.querySelector('#booking-final-fee');
    if (discEl) discEl.textContent = '0';
    if (finalEl) finalEl.textContent = '100.000';
    await loadUser();
    await loadAppointments();
    const instructions = appointment.paymentInstructions;
    userMessage.textContent = appointment.bookingFeeIsPaid
      ? '✓ Đã gửi yêu cầu. Phí giữ chỗ đã được thanh toán bằng điểm; vui lòng chờ lễ tân xác nhận lịch.'
      : `✓ Đã gửi yêu cầu. Chuyển ${Number(instructions.amount).toLocaleString('vi-VN')}đ đến ${instructions.bankName}, tài khoản ${instructions.accountNumber} (${instructions.accountName}), nội dung ${instructions.transferDescription}; lịch được xác nhận sau khi lễ tân đối soát.`;
  } catch (error) {
    userMessage.textContent = error.message;
  }
});

document.querySelector('#support-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await request('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: document.querySelector('#subject').value,
        content: document.querySelector('#content').value
      })
    });
    event.target.reset();
    userMessage.textContent = '✓ Đã gửi yêu cầu hỗ trợ thành công! Nhân viên CSKH sẽ phản hồi sớm.';
  } catch (error) {
    userMessage.textContent = error.message;
  }
});

/* --- LIVE CHAT 1-1 VỚI CSKH --- */
let patientChatRoomId = null;
let patientSignalR = null;

window.openPatientChatModal = async () => {
  document.querySelector('#patient-chat-modal').style.display = 'flex';
  const historyBox = document.querySelector('#patient-chat-history');
  historyBox.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:0.85rem;margin-top:40px;">Đang kết nối tới chuyên viên CSKH...</div>';

  try {
    const room = await request('/api/chat/my-room');
    patientChatRoomId = room.id;

    initPatientSignalR(room.id);
    await loadPatientChatMessages();
  } catch (err) {
    historyBox.innerHTML = `<div style="color:#dc2626;text-align:center;">Lỗi: ${escapeHtml(err.message)}</div>`;
  }
};

window.closePatientChatModal = () => {
  document.querySelector('#patient-chat-modal').style.display = 'none';
};

async function loadPatientChatMessages() {
  if (!patientChatRoomId) return;
  const historyBox = document.querySelector('#patient-chat-history');
  try {
    const msgs = await request(`/api/chat/rooms/${patientChatRoomId}/messages`);
    if (!msgs || !msgs.length) {
      historyBox.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:0.85rem;margin-top:40px;">Bạn có thể nhắn tin hỏi về lịch hẹn, thủ tục BHYT hoặc tư vấn y tế. Chuyên viên sẽ phản hồi sớm nhất!</div>';
      return;
    }

    historyBox.innerHTML = msgs.map(m => {
      const isMe = !m.isFromSupport;
      return `
        <div style="align-self:${isMe ? 'flex-end' : 'flex-start'};max-width:80%;background:${isMe ? '#2563eb' : '#e2e8f0'};color:${isMe ? '#fff' : '#0f172a'};padding:8px 12px;border-radius:12px;font-size:0.88rem;">
          <small style="display:block;font-size:0.7rem;opacity:0.8;margin-bottom:2px;">
            ${escapeHtml(m.senderName)} · ${new Date(m.sentAt).toLocaleTimeString('vi-VN')}
          </small>
          ${escapeHtml(m.content)}
        </div>
      `;
    }).join('');

    historyBox.scrollTop = historyBox.scrollHeight;
  } catch (err) {
    console.error('Lỗi tải tin nhắn:', err);
  }
}

document.querySelector('#patient-chat-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#patient-chat-input');
  const content = input.value.trim();
  if (!content || !patientChatRoomId) return;

  input.value = '';
  try {
    await request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: patientChatRoomId, content })
    });
    await loadPatientChatMessages();
  } catch (err) {
    alert(err.message);
  }
});

function initPatientSignalR(roomId) {
  if (patientSignalR || typeof signalR === 'undefined') return;
  patientSignalR = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/clinic')
    .withAutomaticReconnect()
    .build();

  patientSignalR.on('ReceiveChatMessage', (msg) => {
    if (patientChatRoomId && msg.roomId === patientChatRoomId) {
      loadPatientChatMessages();
    }
  });

  patientSignalR.on('PATIENT_WAITING', () => {
    loadAppointments();
  });

  patientSignalR.on('EXAM_COMPLETED', () => {
    userMessage.textContent = '🎉 Ca khám của bạn đã hoàn thành! Bệnh án và đơn thuốc điện tử đã được cập nhật.';
    loadAppointments();
    loadMedicalRecords();
  });

  patientSignalR.start().then(() => {
    patientSignalR.invoke('JoinRoom', `chat_room_${roomId}`).catch(() => {});
  }).catch(err => console.log('SignalR reconnecting...', err));
}

document.querySelector('#logout')?.addEventListener('click', async () => {
  await request('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}

/* --- NHÀ THUỐC TRỰC TUYẾN OTC & MUA THUỐC TÍCH ĐIỂM --- */
let otcMedicinesList = [];
let selectedOtcMed = null;

function getOtcOrderStatusLabel(status) {
  return ({
    Pending: 'Chờ đối soát chuyển khoản',
    ReadyForPickup: 'Sẵn sàng nhận tại quầy',
    OutForDelivery: 'Đang giao',
    Completed: 'Đã giao/nhận thuốc',
    Cancelled: 'Đã hủy'
  })[status] || status;
}

async function loadMyOtcOrders() {
  const container = document.querySelector('#otc-orders-list');
  if (!container) return;
  try {
    const orders = await request('/api/otc-medicines/orders/mine');
    if (!orders.length) {
      container.innerHTML = '<p class="label">Bạn chưa có đơn thuốc OTC nào.</p>';
      return;
    }

    container.innerHTML = orders.map(order => `
      <div class="item" style="align-items:flex-start;">
        <div>
          <strong>Đơn OTC #${order.id} · ${getOtcOrderStatusLabel(order.status)}</strong>
          <small>${order.items.map(item => `${escapeHtml(item.medicineName)} × ${item.quantity}`).join(', ')}<br>
            ${order.fulfillmentMethod === 'Delivery' ? `Giao đến: ${escapeHtml(order.deliveryAddress)}` : 'Nhận tại quầy nhà thuốc'}<br>
            Tổng ${order.finalAmount.toLocaleString('vi-VN')} đ · ${order.isPaid ? 'Đã thanh toán' : 'Chờ đối soát chuyển khoản'} · ${new Date(order.createdAt).toLocaleString('vi-VN')}
          </small>
          ${order.paymentInstructions ? `<div style="margin-top:8px;padding:10px;background:#eff6ff;border-radius:8px;color:#1e3a8a;">
            <strong>Chuyển khoản ${escapeHtml(order.paymentInstructions.bankName)}</strong><br>
            Tài khoản: ${escapeHtml(order.paymentInstructions.accountNumber)} · Chủ tài khoản: ${escapeHtml(order.paymentInstructions.accountName)}<br>
            Số tiền: ${Number(order.paymentInstructions.amount).toLocaleString('vi-VN')}đ · Nội dung: <strong>${escapeHtml(order.paymentInstructions.transferDescription)}</strong>
          </div>` : ''}
        </div>
        ${order.status === 'Pending' && !order.isPaid ? `<button class="btn-action-sm btn-cancel" onclick="cancelOtcOrder(${order.id})">Hủy đơn</button>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="label">${escapeHtml(err.message)}</p>`;
  }
}

window.cancelOtcOrder = async orderId => {
  if (!confirm('Hủy đơn OTC này? Tồn kho và điểm đã sử dụng sẽ được hoàn lại.')) return;
  try {
    await request(`/api/otc-medicines/orders/${orderId}/cancel`, { method: 'PATCH' });
    await Promise.all([loadMyOtcOrders(), loadOtcMedicines(), loadUser()]);
    userMessage.textContent = 'Đơn OTC đã hủy; tồn kho và điểm thưởng đã được hoàn lại.';
  } catch (err) {
    userMessage.textContent = err.message;
  }
};

async function loadOtcMedicines(category = '') {
  const grid = document.querySelector('#otc-products-grid');
  if (!grid) return;
  try {
    const url = category ? `/api/otc-medicines?category=${encodeURIComponent(category)}` : '/api/otc-medicines';
    otcMedicinesList = await request(url, { cache: 'no-store' });

    if (!otcMedicinesList || !otcMedicinesList.length) {
      grid.innerHTML = '<p class="label">Chưa có sản phẩm thuốc OTC nào trong danh mục này.</p>';
      return;
    }

    grid.innerHTML = otcMedicinesList.map(item => `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.03);display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          ${item.imageUrl
            ? `<img class="otc-product-image" src="${escapeHtml(item.imageUrl)}" alt="Ảnh ${escapeHtml(item.name)}" style="width:100%;height:160px;object-fit:contain;background:#f8fafc;border-radius:8px;margin-bottom:12px;">`
            : '<div class="otc-product-image-placeholder" style="height:160px;display:grid;place-items:center;background:#f8fafc;border-radius:8px;margin-bottom:12px;color:#64748b;">Chưa có ảnh sản phẩm</div>'}
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <span style="font-size:0.75rem;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;padding:2px 8px;border-radius:12px;font-weight:600;">
              ${escapeHtml(item.category)}
            </span>
            <small style="color:${item.stockQuantity > 0 ? '#16a34a' : '#ef4444'};font-weight:600;">
              ${item.stockQuantity > 0 ? `Còn ${item.stockQuantity} ${escapeHtml(item.unit)}` : 'Hết hàng'}
            </small>
          </div>
          <h4 style="margin:0 0 6px;font-size:1.05rem;color:#0f172a;">${escapeHtml(item.name)}</h4>
          <p style="margin:0 0 10px;font-size:0.83rem;color:#64748b;line-height:1.4;">${escapeHtml(item.description)}</p>
          <div style="font-size:0.78rem;color:#475569;margin-bottom:12px;background:#f8fafc;padding:6px 8px;border-radius:6px;">
            <strong>HDSD:</strong> ${escapeHtml(item.usageInstructions)}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9;padding-top:12px;margin-top:6px;">
          <div>
            <div style="font-size:1.15rem;font-weight:800;color:#2563eb;">${item.price.toLocaleString('vi-VN')} đ</div>
            <small style="font-size:0.75rem;color:#94a3b8;">/ ${escapeHtml(item.unit)}</small>
          </div>
          <button class="button small" style="background:#059669;" onclick="openOtcOrderModal(${item.id})" ${item.stockQuantity <= 0 ? 'disabled' : ''}>
            🛒 Chọn mua
          </button>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.otc-product-image').forEach(image => {
      image.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'otc-product-image-placeholder';
        placeholder.textContent = 'Ảnh chưa tải được · cần URL HTTPS trực tiếp đến ảnh';
        placeholder.style.cssText = 'height:160px;display:grid;place-items:center;background:#f8fafc;border-radius:8px;margin-bottom:12px;color:#64748b;';
        image.replaceWith(placeholder);
      }, { once: true });
    });
  } catch (err) {
    grid.innerHTML = `<p class="label">${escapeHtml(err.message)}</p>`;
  }
}

window.filterOtcCategory = (category) => {
  document.querySelectorAll('#otc-category-filter button').forEach(btn => {
    btn.className = 'button small alt';
  });
  if (event && event.target) event.target.className = 'button small active';
  loadOtcMedicines(category);
};

window.openOtcOrderModal = (medicineId) => {
  selectedOtcMed = otcMedicinesList.find(m => m.id === medicineId);
  if (!selectedOtcMed) return;

  document.querySelector('#otc-item-id').value = selectedOtcMed.id;
  const image = document.querySelector('#otc-modal-image');
  image.src = selectedOtcMed.imageUrl || '';
  image.style.display = selectedOtcMed.imageUrl ? 'block' : 'none';
  image.onerror = () => { image.style.display = 'none'; };
  document.querySelector('#otc-modal-name').textContent = selectedOtcMed.name;
  document.querySelector('#otc-modal-desc').textContent = `${selectedOtcMed.description} · ${selectedOtcMed.unit}`;
  document.querySelector('#otc-modal-price').textContent = `${selectedOtcMed.price.toLocaleString('vi-VN')} đ`;

  const qtyInput = document.querySelector('#otc-order-quantity');
  qtyInput.value = 1;
  qtyInput.max = selectedOtcMed.stockQuantity;

  const pointsInput = document.querySelector('#otc-order-points');
  const userPts = currentUser?.rewardPoints ?? currentPatientProfile?.rewardPoints ?? 0;
  pointsInput.value = 0;
  pointsInput.max = userPts;
  pointsInput.placeholder = `Tối đa ${userPts} điểm`;

  if (currentUser) {
    document.querySelector('#otc-order-name').value = currentUser.fullName || '';
    if (currentPatientProfile) {
      document.querySelector('#otc-order-phone').value = currentPatientProfile.phone || '';
      document.querySelector('#otc-order-address').value = currentPatientProfile.address || '';
    }
  }

  updateOtcFulfillmentFields();
  updateOtcSummary();
  document.querySelector('#otc-order-modal').style.display = 'flex';
};

window.closeOtcOrderModal = () => {
  document.querySelector('#otc-order-modal').style.display = 'none';
  selectedOtcMed = null;
};

function updateOtcSummary() {
  if (!selectedOtcMed) return;
  const qty = parseInt(document.querySelector('#otc-order-quantity').value) || 1;
  const subTotal = qty * selectedOtcMed.price;

  const userPts = currentUser?.rewardPoints ?? currentPatientProfile?.rewardPoints ?? 0;
  let pts = parseInt(document.querySelector('#otc-order-points').value) || 0;
  if (pts < 0) pts = 0;
  if (pts > userPts) pts = userPts;
  const maxPts = Math.floor(subTotal / 1000);
  if (pts > maxPts) pts = maxPts;
  document.querySelector('#otc-order-points').value = pts;

  const discount = pts * 1000;
  const finalAmount = Math.max(0, subTotal - discount);

  document.querySelector('#otc-summary-subtotal').textContent = `${subTotal.toLocaleString('vi-VN')} đ`;
  document.querySelector('#otc-summary-discount').textContent = `-${discount.toLocaleString('vi-VN')} đ`;
  document.querySelector('#otc-summary-final').textContent = `${finalAmount.toLocaleString('vi-VN')} đ`;
  document.querySelector('#otc-summary-earn').textContent = 'Điểm thưởng chỉ cộng sau khi nhân viên xác nhận đã nhận tiền.';
}

function updateOtcFulfillmentFields() {
  const isDelivery = document.querySelector('#otc-fulfillment-method').value === 'Delivery';
  const address = document.querySelector('#otc-order-address');
  document.querySelector('#otc-delivery-address-label').style.display = isDelivery ? '' : 'none';
  address.required = isDelivery;
  if (!isDelivery) address.value = '';
}

document.querySelector('#otc-fulfillment-method')?.addEventListener('change', updateOtcFulfillmentFields);
document.querySelector('#otc-order-quantity')?.addEventListener('input', updateOtcSummary);
document.querySelector('#otc-order-points')?.addEventListener('input', updateOtcSummary);

document.querySelector('#otc-order-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedOtcMed) return;
  try {
    const qty = parseInt(document.querySelector('#otc-order-quantity').value) || 1;
    const pts = parseInt(document.querySelector('#otc-order-points').value) || 0;
    const name = document.querySelector('#otc-order-name').value.trim();
    const phone = document.querySelector('#otc-order-phone').value.trim();
    const address = document.querySelector('#otc-order-address').value.trim();

    const result = await request('/api/otc-medicines/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ medicineId: selectedOtcMed.id, quantity: qty }],
        pointsToUse: pts,
        receiverName: name,
        receiverPhone: phone,
        deliveryAddress: address,
        fulfillmentMethod: document.querySelector('#otc-fulfillment-method').value
      })
    });

    closeOtcOrderModal();
    await loadUser();
    await Promise.all([loadOtcMedicines(), loadMyOtcOrders()]);
    userMessage.style.color = '#16a34a';
    const instructions = result.paymentInstructions;
    userMessage.textContent = instructions
      ? `✓ Đơn #${result.id} đã tạo. Chuyển ${Number(instructions.amount).toLocaleString('vi-VN')}đ đến ${instructions.bankName}, tài khoản ${instructions.accountNumber} (${instructions.accountName}), nội dung ${instructions.transferDescription}; nhân viên sẽ đối soát trước khi giao/nhận thuốc.`
      : `✓ ${result.message} Tổng thanh toán: ${result.finalAmount.toLocaleString('vi-VN')} VNĐ.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
  }
});

Promise.all([loadUser(), loadDoctors(), loadOtcMedicines()])
  .then(() => Promise.all([loadAppointments(), loadMedicalRecords(), loadMyOtcOrders()]))
  .catch(async error => {
    console.error('Không thể tải dữ liệu cổng bệnh nhân:', error);
    let authResponse;
    try {
      authResponse = await fetch('/api/auth/me');
    } catch (authError) {
      console.error('Không thể kiểm tra phiên đăng nhập:', authError);
      userMessage.style.color = '#dc2626';
      userMessage.textContent = 'Không thể kết nối máy chủ để tải dữ liệu. Vui lòng thử tải lại trang.';
      return;
    }

    if (authResponse.status === 401) {
      location.href = '/login.html';
      return;
    }

    userMessage.style.color = '#dc2626';
    userMessage.textContent = `Đăng nhập thành công nhưng không tải được dữ liệu: ${error.message}`;
  });

window.addEventListener('focus', () => {
  loadOtcMedicines();
});

window.loadAppointments = loadAppointments;
window.addEventListener('medika:appointment-created', () => {
  loadAppointments();
});
