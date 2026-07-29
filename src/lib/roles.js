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

// Voiding a sale puts money back and stock back, so it is not something to leave
// wide open. But a mis-ring has to be fixable by whoever made it, right then, or
// the register stays wrong until a manager walks over: register staff can void
// their own sale from today, and whoever runs the shop can void any of them.
export const canVoidAnySale = (role) => role === "owner" || role === "manager";

// Counting the drawer and settling the day belongs to whoever is closing the shop.
export const canCloseOut = (role) => role === "owner" || role === "manager";
export const canVoidSale = (role, sale, userId) =>
  canVoidAnySale(role) || (Boolean(userId) && sale.userId === userId);

// Roles the owner can hand out. The owner role is not in the list: it is created
// once, during first-run setup.
export const ASSIGNABLE_ROLES = [
  { value: "employee", label: ROLE_LABEL.employee, hint: "Register only." },
  { value: "manager", label: ROLE_LABEL.manager, hint: "Register and inventory." },
];
