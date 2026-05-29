// ================================================================
// Student popup — click any student avatar to see their info
// Shared across advisor, viewer, admin, and student pages
// ================================================================
import Swal from 'sweetalert2';
import type { GroupMember } from '../../types';

export function showStudentPopup(member: GroupMember) {
  const phone = member.phone || 'ไม่มีข้อมูลติดต่อ';
  Swal.fire({
    html: `
      <div class="text-center pt-2">
        <img src="${member.profileUrl}"
          class="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mx-auto mb-4
                 border-[4px] border-cyan-100 dark:border-neutral-800 shadow-md bg-white"
          loading="lazy"
        >
        <h3 class="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white leading-tight">
          ${member.firstName} ${member.lastName}
        </h3>
        <p class="text-xs sm:text-sm text-neutral-400 dark:text-neutral-500 mb-5 mt-1 font-medium">
          รหัสประจำตัว: ${member.studentId}
        </p>
        <div class="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl p-4 inline-block w-full
                    border border-cyan-100 dark:border-cyan-900/50">
          <p class="text-xs text-cyan-600 dark:text-cyan-400 mb-1.5 font-bold uppercase
                     flex items-center justify-center">
            <svg class="w-4 h-4 mr-1.5 opacity-80" fill="none" stroke="currentColor"
                 stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            เบอร์โทรติดต่อ
          </p>
          <p class="text-lg font-extrabold text-cyan-800 dark:text-cyan-300 tracking-wide">
            ${phone}
          </p>
        </div>
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: 'ปิดหน้าต่าง',
    buttonsStyling: false,
    customClass: {
      popup: 'rounded-[1.5rem] w-[90%] max-w-sm border border-neutral-100 dark:border-neutral-800 shadow-2xl',
      confirmButton: 'bg-neutral-800 dark:bg-neutral-700 text-white font-bold py-3 px-8 rounded-full mt-5 hover:bg-neutral-900 transition-colors text-sm w-full btn-liquid',
    },
    backdrop: 'rgba(0,0,0,0.4)',
  });
}
