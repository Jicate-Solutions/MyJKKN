// @vitest-environment jsdom
/**
 * Parent User Data panel — "Sign out of all devices" for a parent.
 * The button is hidden until the kill-switch column exists, and nothing is
 * signed out until the confirm dialog's "Yes" is pressed.
 */
import "@testing-library/jest-dom";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listParentUsers = vi.fn();
const parentSignOutAvailable = vi.fn();
const signOutParentEverywhere = vi.fn();
const showParentPassword = vi.fn();
const writeFile = vi.fn();
const jsonToSheet = vi.fn((rows: unknown) => ({ rows }));

vi.mock("@/lib/services/academic/parent-portal-admin-service", () => ({
  ParentPortalAdminService: {
    listParentUsers: (...a: unknown[]) => listParentUsers(...a),
    parentSignOutAvailable: () => parentSignOutAvailable(),
    signOutParentEverywhere: (id: string) => signOutParentEverywhere(id),
    resetParentPassword: vi.fn(),
    showParentPassword: (id: string) => showParentPassword(id),
  },
}));
vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: (rows: unknown) => jsonToSheet(rows),
    book_new: () => ({}),
    book_append_sheet: vi.fn(),
  },
  writeFile: (...a: unknown[]) => writeFile(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import {
  ParentUsersPanel,
  PARENT_SIGN_OUT_WARNING,
} from "@/app/(routes)/academic/parent-portal/_components/parent-users-panel";

const ACCOUNT = "00000000-0000-4000-8000-0000000000c3";
const TARGET = { institutionId: "inst-a" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  listParentUsers.mockResolvedValue({
    ok: true,
    status: 200,
    json: {
      institutions: [],
      institutionId: "inst-a",
      users: [
        {
          accountId: ACCOUNT,
          learnerId: "l-1",
          rollNumber: "24UBA001",
          learnerName: "Kavya R",
          fatherMobile: "9000000001",
          motherMobile: "",
          loginMobile: "9000000001",
          isAdminReset: false,
          isActive: true,
        },
      ],
    },
  });
  parentSignOutAvailable.mockResolvedValue(true);
  signOutParentEverywhere.mockResolvedValue(undefined);
});
afterEach(cleanup);

function listAs(viewerIsSuperAdmin: boolean) {
  listParentUsers.mockResolvedValue({
    ok: true,
    status: 200,
    json: {
      institutions: [],
      institutionId: "inst-a",
      viewerIsSuperAdmin,
      users: [
        {
          accountId: ACCOUNT,
          learnerId: "l-1",
          rollNumber: "24UBA001",
          learnerName: "Kavya R",
          fatherMobile: "9000000001",
          motherMobile: "",
          loginMobile: "9000000001",
          isAdminReset: false,
          isActive: true,
        },
      ],
    },
  });
}

describe("Parent User Data — the table", () => {
  it("lists the accounts the server returned (they live in the response .json)", async () => {
    render(<ParentUsersPanel target={TARGET} />);
    expect(await screen.findByText("Kavya R")).toBeInTheDocument();
  });

  it("has NO Password column and shows no stored value, even if a server sent one", async () => {
    // Even if an older server still sent a value, the screen must not show it.
    listParentUsers.mockResolvedValue({
      ok: true,
      status: 200,
      json: {
        institutions: [],
        institutionId: "inst-a",
        users: [
          {
            accountId: ACCOUNT,
            learnerId: "l-1",
            rollNumber: "24UBA001",
            learnerName: "Kavya R",
            fatherMobile: "9000000001",
            motherMobile: "",
            loginMobile: "9000000001",
            password: "Secret@123",
            isAdminReset: true,
            isActive: true,
          },
        ],
      },
    });
    render(<ParentUsersPanel target={TARGET} />);
    await screen.findByText("Kavya R");
    expect(screen.queryByRole("columnheader", { name: /password/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Secret@123")).not.toBeInTheDocument();
    expect(screen.queryByText(/JKKN@100/)).not.toBeInTheDocument();
    // The Reset button still works.
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    // Not a super admin (viewerIsSuperAdmin absent) → no Show button either.
    expect(screen.queryByRole("button", { name: /show password/i })).not.toBeInTheDocument();
  });
});

describe("Parent User Data — Show password (super admins only, Director 2 Oct 2026)", () => {
  it("an admin or principal who is not a super admin gets no Show button", async () => {
    listAs(false);
    render(<ParentUsersPanel target={TARGET} />);
    await screen.findByText("Kavya R");
    expect(screen.queryByRole("button", { name: /show password/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /password/i })).not.toBeInTheDocument();
  });

  it("a super admin gets a per-row Show button that asks the server and shows the answer", async () => {
    listAs(true);
    showParentPassword.mockResolvedValue({ password: "JKKN@100" });
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(await screen.findByRole("button", { name: /show password/i }));
    expect(await screen.findByText("JKKN@100")).toBeInTheDocument();
    expect(showParentPassword).toHaveBeenCalledWith(ACCOUNT);
    // Still no Password column.
    expect(screen.queryByRole("columnheader", { name: /password/i })).not.toBeInTheDocument();
    // Hide puts the button back.
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(screen.queryByText("JKKN@100")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show password/i })).toBeInTheDocument();
  });

  it("shows only \"Changed by parent\" when the parent changed their password", async () => {
    listAs(true);
    showParentPassword.mockResolvedValue({ changedByParent: true });
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(await screen.findByRole("button", { name: /show password/i }));
    expect(await screen.findByText("Changed by parent")).toBeInTheDocument();
  });

  it("a refusal from the server is shown as a message, and no value appears", async () => {
    listAs(true);
    showParentPassword.mockRejectedValue(new Error("Only a super admin can see a parent's password."));
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(await screen.findByRole("button", { name: /show password/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only a super admin can see a parent's password."));
    expect(screen.getByRole("button", { name: /show password/i })).toBeInTheDocument();
  });

  it("a shown password never goes into the Excel export", async () => {
    listAs(true);
    showParentPassword.mockResolvedValue({ password: "Secret@123" });
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(await screen.findByRole("button", { name: /show password/i }));
    await screen.findByText("Secret@123");
    fireEvent.click(screen.getByRole("button", { name: /export excel/i }));
    expect(writeFile).toHaveBeenCalledTimes(1);
    const exported = JSON.stringify(jsonToSheet.mock.calls[0][0]);
    expect(exported).not.toMatch(/Secret@123|password/i);
  });
});

describe("Parent User Data — Sign out of all devices", () => {
  it("is hidden while the database update is not applied", async () => {
    parentSignOutAvailable.mockResolvedValue(false);
    render(<ParentUsersPanel target={TARGET} />);
    await screen.findByText("Kavya R");
    await waitFor(() => expect(parentSignOutAvailable).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /sign out of all devices/i }),
    ).not.toBeInTheDocument();
  });

  it("requires the confirm click before anything happens", async () => {
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /sign out of all devices/i }),
    );
    expect(screen.getByText(PARENT_SIGN_OUT_WARNING)).toBeInTheDocument();
    expect(signOutParentEverywhere).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: /yes, sign the parent out everywhere/i,
      }),
    );
    await waitFor(() =>
      expect(signOutParentEverywhere).toHaveBeenCalledWith(ACCOUNT),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0][0]).toContain(
      "Signed out on every device. A page already open may keep working for up to an hour.",
    );
  });

  it("Cancel closes the dialog without signing out", async () => {
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /sign out of all devices/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(PARENT_SIGN_OUT_WARNING),
      ).not.toBeInTheDocument(),
    );
    expect(signOutParentEverywhere).not.toHaveBeenCalled();
  });

  it("shows a refusal inside the dialog instead of redirecting", async () => {
    signOutParentEverywhere.mockRejectedValue(
      new Error("You can only sign out parent accounts in your institution."),
    );
    render(<ParentUsersPanel target={TARGET} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /sign out of all devices/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /yes, sign the parent out everywhere/i,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /only sign out parent accounts/,
      ),
    );
  });
});
