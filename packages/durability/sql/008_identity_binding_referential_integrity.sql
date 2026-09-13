ALTER TABLE application_identity_binding
  ADD CONSTRAINT application_identity_binding_participant_id_fkey
    FOREIGN KEY (participant_id) REFERENCES application_participant(participant_id),
  ADD CONSTRAINT application_identity_binding_bound_by_fkey
    FOREIGN KEY (bound_by) REFERENCES application_participant(participant_id),
  ADD CONSTRAINT application_identity_binding_authority_grant_id_fkey
    FOREIGN KEY (authority_grant_id) REFERENCES application_authority_grant(grant_id);
