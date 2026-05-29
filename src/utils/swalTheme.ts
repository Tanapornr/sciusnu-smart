import Swal from 'sweetalert2';

/** Shared SweetAlert classes — pair with src/styles/swal.css tokens */
export const SWAL_POPUP = 'swal-app-popup';
export const SWAL_ADMIN_POPUP = 'swal-admin';

export const appSwal = Swal.mixin({
  customClass: {
    popup: SWAL_POPUP,
  },
});

export const adminSwal = Swal.mixin({
  customClass: {
    popup: SWAL_ADMIN_POPUP,
  },
});
