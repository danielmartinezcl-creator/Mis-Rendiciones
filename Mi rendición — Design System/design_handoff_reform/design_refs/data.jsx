/* data.jsx — sample rendiciones used across screens */
const REPORTS = [
  { id: 'r1', title: 'Viaje Santiago · Cliente ACME', submitter: 'Camila Soto', dept: 'Comercial',
    status: 'approved', total: 235400, approved: 235400, submitted: '14/05/2026', approvedAt: '15/05/2026', items: 6 },
  { id: 'r2', title: 'Almuerzos equipo · Abril', submitter: 'Camila Soto', dept: 'Comercial',
    status: 'submitted', total: 84200, approved: 0, submitted: '02/05/2026', items: 3 },
  { id: 'r3', title: 'Insumos oficina', submitter: 'Camila Soto', dept: 'Comercial',
    status: 'reimbursed', total: 47900, approved: 47900, submitted: '18/04/2026', reimbursedAt: '28/04/2026', ref: 'TRF-9921', items: 2 },
  { id: 'r4', title: 'Conferencia UX · Inscripción', submitter: 'Camila Soto', dept: 'Comercial',
    status: 'partially_approved', total: 320000, approved: 180000, submitted: '20/05/2026', items: 4 },
  { id: 'r5', title: 'Taxi reuniones semana', submitter: 'Camila Soto', dept: 'Comercial',
    status: 'draft', total: 28600, approved: 0, submitted: null, created: '21/05/2026', items: 2 },
];

const ALL_REPORTS = [
  ...REPORTS,
  { id: 'a1', title: 'Feria logística · Stand', submitter: 'Diego Fuentes', dept: 'Operaciones',
    status: 'submitted', total: 540000, approved: 0, submitted: '19/05/2026', items: 9, flag: 'high' },
  { id: 'a2', title: 'Combustible flota', submitter: 'Pedro Ramírez', dept: 'Operaciones',
    status: 'pending_l2', total: 412300, approved: 0, submitted: '17/05/2026', items: 7 },
  { id: 'a3', title: 'Marketing redes · Mayo', submitter: 'Josefa Lagos', dept: 'Marketing',
    status: 'approved', total: 198000, approved: 198000, submitted: '12/05/2026', approvedAt: '13/05/2026', items: 5, flag: 'unreimbursed' },
  { id: 'a4', title: 'Capacitación ventas', submitter: 'Diego Fuentes', dept: 'Comercial',
    status: 'rejected', total: 96000, approved: 0, submitted: '10/05/2026', items: 3 },
];

const SAMPLE_ITEMS = [
  { desc: 'Almuerzo con cliente', cat: 'Alimentación', merchant: 'Tiramisú', doc: 'Boleta', amount: 38900, status: 'approved' },
  { desc: 'Taxi aeropuerto', cat: 'Transporte', merchant: 'Cabify', doc: 'Boleta', amount: 12500, status: 'approved' },
  { desc: 'Hotel · 2 noches', cat: 'Alojamiento', merchant: 'Hotel Plaza', doc: 'Factura', amount: 184000, status: 'approved' },
];

Object.assign(window, { REPORTS, ALL_REPORTS, SAMPLE_ITEMS });
