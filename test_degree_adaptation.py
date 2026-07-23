from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the specific degree detail page
    degree_id = "02e2925a-069d-4050-8829-deebf6fcac0c"
    page.goto(f'http://localhost:3000/organizations/degrees/{degree_id}')
    page.wait_for_load_state('networkidle')

    # Take screenshot of detail page
    os.makedirs('/tmp/test_screenshots', exist_ok=True)
    page.screenshot(path='/tmp/test_screenshots/degree_detail.png', full_page=True)

    # Get page content to verify labels
    content = page.content()

    # Check for adapted labels
    labels_to_check = {
        'Stream ID': 'Stream ID' in content,
        'Stream Name': 'Stream Name' in content,
        'Stream Details': 'Stream Details' in content,
        'Edit Stream': 'Edit Stream' in content,
    }

    print("=== DETAIL PAGE LABEL CHECK ===")
    for label, found in labels_to_check.items():
        status = "[OK]" if found else "[FAIL]"
        print(f"{status} {label}: {found}")

    # Check for non-adapted labels (should NOT be present for schools)
    old_labels = {
        'Degree Details': 'Degree Details' in content and 'Stream Details' in content,
        'Edit Degree': 'Edit Degree' in content and 'Edit Stream' in content,
    }

    print("\n=== OLD LABELS (should be false) ===")
    for label, should_be_false in old_labels.items():
        status = "[OK]" if not should_be_false else "[FAIL]"
        print(f"{status} {label} shouldn't appear: {not should_be_false}")

    # Click Edit button if it exists
    edit_button = page.locator('a:has-text("Edit Stream")').first
    if edit_button.is_visible():
        edit_button.click()
        page.wait_for_load_state('networkidle')

        # Take screenshot of edit page
        page.screenshot(path='/tmp/test_screenshots/degree_edit.png', full_page=True)

        # Check edit page labels
        edit_content = page.content()
        edit_labels = {
            'Edit Stream': 'Edit Stream' in edit_content,
            'Stream ID': 'Stream ID' in edit_content,
            'Stream Name': 'Stream Name' in edit_content,
        }

        print("\n=== EDIT PAGE LABEL CHECK ===")
        for label, found in edit_labels.items():
            status = "[OK]" if found else "[FAIL]"
            print(f"{status} {label}: {found}")
    else:
        print("\n[FAIL] Edit Stream button not found on detail page")

    browser.close()
    print("\n[OK] Screenshots saved to /tmp/test_screenshots/")
