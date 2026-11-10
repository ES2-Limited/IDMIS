DO $$
DECLARE
  v_admin_id uuid;
  v_file_id uuid := '018f3b10-0000-7000-8000-000000000001';
  v_batch_id uuid := '018f3b10-0000-7000-8000-000000000002';
BEGIN
  SELECT id INTO v_admin_id FROM core.app_user WHERE email = 'admin@idmis.gov.ng';
  
  INSERT INTO core.file (id, original_name, storage_key, mime_type, size_bytes, sha256, scan_status, created_by, updated_by)
  VALUES (v_file_id, 'demo_wua_import.xlsx', 'files/demo.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024, '0000000000000000000000000000000000000000000000000000000000000000', 'clean', v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO core.import_batch (id, dataset, file_id, status, total_rows, valid_rows, error_rows, committed_rows, created_by)
  VALUES (v_batch_id, 'wua', v_file_id, 'validated', 2, 2, 0, 0, v_admin_id)
  ON CONFLICT (id) DO UPDATE SET status = 'validated', valid_rows = 2, total_rows = 2, error_rows = 0;

  DELETE FROM core.import_row WHERE batch_id = v_batch_id;

  INSERT INTO core.import_row (id, batch_id, row_number, natural_key, status, raw_data, parsed_data)
  VALUES 
    ('018f3b10-0000-7000-8000-000000000003', v_batch_id, 2, 'Kadawa North WUA', 'valid', '{"name":"Kadawa North WUA","level":"sector","schemeCode":"SCH-KRIS"}', '{"name":"Kadawa North WUA","level":"sector","schemeCode":"SCH-KRIS"}'),
    ('018f3b10-0000-7000-8000-000000000004', v_batch_id, 3, 'Kura Apex WUA', 'valid', '{"name":"Kura Apex WUA","level":"apex","schemeCode":"SCH-KRIS"}', '{"name":"Kura Apex WUA","level":"apex","schemeCode":"SCH-KRIS"}');
END $$;
