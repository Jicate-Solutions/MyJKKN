-- Optimistic upgrade (3/3): migrate in-flight upgrades to the optimistic model.
-- A) Stamp the original category onto each in-window waiting upgrade hold (capture BEFORE flip).
UPDATE hostel_waitlist w
   SET from_hostel_category_id = lp.hostel_category_id, updated_at=now()
  FROM profiles p
  JOIN learners_profiles lp ON lp.id = p.learner_id
 WHERE w.learner_id = p.id
   AND w.entry_kind='upgrade' AND w.status='waiting'
   AND w.hold_expires_at IS NOT NULL AND w.hold_expires_at >= now()
   AND w.from_hostel_category_id IS NULL
   AND lp.pending_hostel_category_id IS NOT NULL
   AND lp.pending_hostel_category_id = w.target_hostel_category_id;

-- B) Flip those learners' category to the upgraded one (pending -> hostel_category_id).
UPDATE learners_profiles lp
   SET hostel_category_id = lp.pending_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now()
 WHERE lp.pending_hostel_category_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM profiles p
     JOIN hostel_waitlist w ON w.learner_id = p.id
     WHERE p.learner_id = lp.id
       AND w.entry_kind='upgrade' AND w.status='waiting'
       AND w.hold_expires_at IS NOT NULL AND w.hold_expires_at >= now()
       AND w.target_hostel_category_id = lp.pending_hostel_category_id
       AND w.from_hostel_category_id IS NOT NULL
   );

-- C) Clean up genuinely-stuck rows (no waitlist row, or no deadline) that B didn't flip.
UPDATE hostel_beds b SET status='available'
  FROM hostel_waitlist w, profiles p, learners_profiles lp
 WHERE b.id = w.held_bed_id AND b.status='reserved'
   AND w.learner_id = p.id AND lp.id = p.learner_id
   AND w.entry_kind='upgrade' AND w.status='waiting'
   AND lp.pending_hostel_category_id IS NOT NULL
   AND lp.pending_hostel_category_id = w.target_hostel_category_id;

UPDATE hostel_waitlist w SET status='expired', held_bed_id=NULL, held_room_id=NULL, hold_expires_at=NULL, updated_at=now()
  FROM profiles p, learners_profiles lp
 WHERE w.learner_id = p.id AND lp.id = p.learner_id
   AND w.entry_kind='upgrade' AND w.status='waiting'
   AND lp.pending_hostel_category_id IS NOT NULL
   AND lp.pending_hostel_category_id = w.target_hostel_category_id;

UPDATE learners_profiles SET pending_hostel_category_id = NULL, updated_at=now()
 WHERE pending_hostel_category_id IS NOT NULL;
