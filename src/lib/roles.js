// Who can do what. Kept in one place so a screen and its tab can never disagree
// about whether someone is allowed in.

export const ROLE_LABEL = {
  owner: "Owner",
  manager: "Manager",
  employee: "Staff",
};

export const roleLabel = (role) => ROLE_LABEL[role] || ROLE_LABEL.employee;

// Stock levels, restocking and adding ingredients: the shop's admin and whoever
// is running the shift. Not the register staff.
export const canSeeInventory = (role) => role === "owner" || role === "manager";

// Staff accounts stay with the admin.
export const canManageStaff = (role) => role === "owner";

// Roles the owner can hand out. The owner role is not in the list: it is created
// once, during first-run setup.
export const ASSIGNABLE_ROLES = [
  { value: "employee", label: ROLE_LABEL.employee, hint: "Register only." },
  { value: "manager", label: ROLE_LABEL.manager, hint: "Register and inventory." },
];
