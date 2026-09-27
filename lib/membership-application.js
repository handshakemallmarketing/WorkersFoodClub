export function toApplicationView(row) {
  return {
    applicationId: String(row.application_id),
    issuer: String(row.issuer),
    subject: String(row.subject),
    contactNote: row.contact_note == null ? null : String(row.contact_note),
    state: String(row.state),
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : String(row.submitted_at),
    decidedAt: row.decided_at == null ? null : (row.decided_at instanceof Date ? row.decided_at.toISOString() : String(row.decided_at)),
    decidedBy: row.decided_by == null ? null : String(row.decided_by),
    resultingMembershipId: row.resulting_membership_id == null ? null : String(row.resulting_membership_id),
  };
}
