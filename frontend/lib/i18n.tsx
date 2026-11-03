"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ka";

const D = {
  en: {
    nav_active: "Active Orders", nav_history: "Order History", nav_couriers: "Couriers", nav_settings: "Settings", nav_analytics: "Analytics",
    soon: "Coming soon", sign_in: "Sign in", sign_out: "Sign out", email: "Email", password: "Password", bad_login: "Invalid credentials",
    simulated: "SIMULATED DEMO DATA", search: "Search", search_order: "Search order", all: "All", loading: "Loading…",
    dispatched: "Dispatched", pending_dispatch: "Pending dispatch", no_orders: "No orders", show_open_orders: "Show open orders",
    gps: "GPS", zone: "Zone", vehicle: "Vehicle", cars: "Cars", scooters: "Scooters", never: "never reported",
    realtime: "Realtime", delayed: "Delayed", offline: "Offline", unknown: "No signal yet", last_known: "Last known position — not current",
    status: "Status", courier: "Courier", age: "Age", zones: "Zones", show_zones: "Show zones",
    st_new: "New", st_ready: "Ready", st_assigned: "Assigned", st_picked_up: "Delivering", st_delivered: "Delivered",
    st_failed: "Failed", st_returned: "Returned", st_cancelled: "Cancelled",
    set_account: "Account", set_addresses: "Saved Addresses", set_delivery: "Delivery Parameters", set_payment: "Payment Parameters",
    set_geofencing: "Geofencing", set_geolocation: "Geolocation", set_team: "Manage Your Team", parameters: "Parameters",
    save: "Save", saved: "Saved", cancel: "Cancel", add: "Add", edit: "Edit", delete: "Delete", create: "Create", close: "Close",
    confirm_delete: "Delete this item?", read_only: "You can view these settings but not change them.", error: "Error",
    addr_title: "Saved Addresses", add_address: "Add Address", address: "Address", entrance: "Entrance, Floor, Apartment", name: "Name",
    phone: "Phone Number", pin_hint: "Click on the map to place the pin (optional). Geocoding is not connected yet — type the address.",
    zones_title: "Geofencing", create_zone: "Create", zone_name: "Zone name", zone_hint: "Click the map to add points (at least 3). Use Undo to remove the last point.",
    undo: "Undo", clear: "Clear", color: "Color", n_couriers: "{n} Courier(s)", assign_couriers: "Assign couriers", no_zones: "No zones yet",
    company: "Company name", language: "Default language", timezone: "Time zone",
    service_time: "Default service time per stop (seconds)", max_orders: "Max active orders per courier", late_min: "Late threshold (minutes)",
    auto_dispatch: "Automatic dispatch (off = dispatcher approval)", currency: "Currency", base_rate: "Base rate per delivery", per_km: "Rate per km",
    payment_note: "Placeholder values. The compensation rules engine (weather bonuses, ledger) arrives in a later phase.",
    gps_interval: "GPS interval (seconds)", realtime_age: "Realtime if last fix newer than (seconds)", delayed_age: "Delayed if newer than (seconds)",
    retention: "Keep location history (days)",
    geo_note: "Stored for the mobile app and reports; automatic enforcement arrives with the mobile app. Tracking is limited to active shifts and requires courier consent.",
    team_title: "Manage Your Team", add_user: "Add user", role: "Role", active: "Active", inactive: "Inactive", reset_password: "New password",
    full_name: "Full name", users_note: "Passwords are never shown. Leave the password empty to keep it unchanged.", roles: "Roles",
    me_signed: "Signed in as", only_admin: "Only administrators can manage users.", total: "Total",
    new_order: "Order", place_order: "Place an order", where_from: "Where from", where_to: "Where to",
    saved_hint: "Pre-saved addresses", no_saved: "No saved addresses match", assign_title: "Assign couriers", choose_later: "Choose later",
    in_house: "In-house couriers", external: "External providers", cars_only: "Need a car", not_connected: "Not connected",
    providers_note: "Wolt and Glovo quotes appear here once the integrations are connected (they need partner credentials).",
    create_order: "Create order", customer: "Customer name", weight: "Weight (kg)", priority: "Priority", details: "Entrance, floor, apartment",
    too_heavy: "Too heavy: vehicle max {n} kg", pick_on_map: "Click the map to set the pin for the selected field.", prio_normal: "Normal", prio_high: "High", prio_urgent: "Urgent",
    nav_dashboard: "Dashboard", nav_orders: "Orders", nav_map: "Live map", nav_reports: "Reports",
    search_global: "Search order ID, customer, address…", kpi_total: "Total orders", kpi_pending: "Pending", kpi_transit: "In transit",
    kpi_delivered: "Delivered", kpi_failed: "Failed delivery", kpi_sub: "All time", orders_by_zone: "Orders by zone", no_zone: "No zone",
    recent_alerts: "Recent alerts", recent_orders: "Recent orders", view_all: "View all", quick_actions: "Quick actions",
    qa_create: "Create order", qa_map: "Live map", qa_zones: "Zones", qa_address: "Saved addresses",
    alert_failed: "Delivery failed", alert_unassigned: "Courier not assigned", alert_late: "Delivery window passed", no_alerts: "No alerts",
    export_csv: "Export", all_status: "All status", all_zones: "All zones", all_couriers: "All couriers",
    col_order: "Order ID", col_customer: "Customer", col_date: "Date", showing: "Showing {a}–{b} of {n} orders", selected_n: "{n} selected",
    view_table: "Table", view_chart: "Chart", unassigned_courier: "Not assigned",
    step_placed: "Order placed", step_assigned: "Courier assigned", step_transit: "Out for delivery", step_delivered: "Delivered",
    order_details: "Order details", n_orders: "{n} orders", share: "Share",
    tab_all: "All orders", order_info: "Order info", tracking: "Tracking", layers: "Layers", map_tab: "Map", add_order: "Add order",
    layer_orders: "Orders", created: "Created", pickup_loc: "Pickup location", delivery_loc: "Delivery location", copied: "Copied", copy_id: "Copy ID",
    guide_line: "Straight guide line, not a road route.",
    order_created: "Order created", pin_dropped: "Pin", dark_mode: "Dark mode", light_mode: "Light mode", gps_stale: "GPS not live",
  },
  ka: {
    nav_active: "აქტიური შეკვეთები", nav_history: "შეკვეთების ისტორია", nav_couriers: "კურიერები", nav_settings: "პარამეტრები", nav_analytics: "ანალიტიკა",
    soon: "მალე", sign_in: "შესვლა", sign_out: "გასვლა", email: "ელფოსტა", password: "პაროლი", bad_login: "არასწორი მონაცემები",
    simulated: "სიმულირებული დემო მონაცემები", search: "ძებნა", search_order: "შეკვეთის ძებნა", all: "ყველა", loading: "იტვირთება…",
    dispatched: "გადაცემული", pending_dispatch: "გადასაცემი", no_orders: "შეკვეთები არ არის", show_open_orders: "ღია შეკვეთების ჩვენება",
    gps: "GPS", zone: "ზონა", vehicle: "ტრანსპორტი", cars: "მანქანები", scooters: "სკუტერები", never: "არასდროს გამოცხადებულა",
    realtime: "რეალურ დროში", delayed: "დაგვიანებული", offline: "გათიშული", unknown: "სიგნალი ჯერ არ ყოფილა", last_known: "ბოლო ცნობილი პოზიცია — არა მიმდინარე",
    status: "სტატუსი", courier: "კურიერი", age: "ასაკი", zones: "ზონები", show_zones: "ზონების ჩვენება",
    st_new: "ახალი", st_ready: "მზადაა", st_assigned: "მინიჭებული", st_picked_up: "იგზავნება", st_delivered: "ჩაბარებული",
    st_failed: "ჩავარდნილი", st_returned: "დაბრუნებული", st_cancelled: "გაუქმებული",
    set_account: "ანგარიში", set_addresses: "დამახსოვრებული მისამართები", set_delivery: "მიტანის პარამეტრები", set_payment: "გადახდის პარამეტრები",
    set_geofencing: "გეოზონები", set_geolocation: "გეოლოკაცია", set_team: "გუნდის მართვა", parameters: "პარამეტრები",
    save: "შენახვა", saved: "შენახულია", cancel: "გაუქმება", add: "დამატება", edit: "რედაქტირება", delete: "წაშლა", create: "შექმნა", close: "დახურვა",
    confirm_delete: "წაიშალოს?", read_only: "ამ პარამეტრებს ხედავთ, მაგრამ ვერ ცვლით.", error: "შეცდომა",
    addr_title: "დამახსოვრებული მისამართები", add_address: "მისამართის დამატება", address: "მისამართი", entrance: "სადარბაზო, სართული, ბინა", name: "სახელი",
    phone: "ტელეფონი", pin_hint: "დააწკაპუნეთ რუკაზე პინის დასასმელად (არასავალდებულო). გეოკოდირება ჯერ არ არის დაკავშირებული — მისამართი ხელით ჩაწერეთ.",
    zones_title: "გეოზონები", create_zone: "შექმნა", zone_name: "ზონის სახელი", zone_hint: "დააწკაპუნეთ რუკაზე წერტილების დასამატებლად (მინიმუმ 3). „ბოლოს გაუქმება“ ბოლო წერტილს შლის.",
    undo: "ბოლოს გაუქმება", clear: "გასუფთავება", color: "ფერი", n_couriers: "{n} კურიერი", assign_couriers: "კურიერების მიმაგრება", no_zones: "ზონები ჯერ არ არის",
    company: "კომპანიის სახელი", language: "ნაგულისხმევი ენა", timezone: "დროის სარტყელი",
    service_time: "მომსახურების დრო გაჩერებაზე (წამი)", max_orders: "კურიერზე მაქს. აქტიური შეკვეთები", late_min: "დაგვიანების ზღვარი (წუთი)",
    auto_dispatch: "ავტომატური გადაცემა (გამორთული = დისპეტჩერის დადასტურებით)", currency: "ვალუტა", base_rate: "საბაზო ტარიფი მიტანაზე", per_km: "ტარიფი კმ-ზე",
    payment_note: "დროებითი მნიშვნელობებია. კომპენსაციის წესების ძრავა (ამინდის ბონუსი, წიგნი) მომდევნო ფაზაშია.",
    gps_interval: "GPS ინტერვალი (წამი)", realtime_age: "რეალურ დროში, თუ ბოლო წერტილი უფრო ახალია ვიდრე (წამი)", delayed_age: "დაგვიანებული, თუ უფრო ახალია ვიდრე (წამი)",
    retention: "მდებარეობის ისტორიის შენახვა (დღე)",
    geo_note: "ინახება მობილური აპისა და ანგარიშებისთვის; ავტომატური აღსრულება მობილურ აპთან ერთად დაემატება. თვალყურის დევნება მხოლოდ აქტიურ ცვლაშია და კურიერის თანხმობას მოითხოვს.",
    team_title: "გუნდის მართვა", add_user: "მომხმარებლის დამატება", role: "როლი", active: "აქტიური", inactive: "გამორთული", reset_password: "ახალი პაროლი",
    full_name: "სახელი და გვარი", users_note: "პაროლი არასდროს ჩანს. ცვლილების გარეშე დატოვეთ პაროლის ველი ცარიელი.", roles: "როლები",
    me_signed: "შესული ხართ როგორც", only_admin: "მომხმარებლების მართვა მხოლოდ ადმინისტრატორს შეუძლია.", total: "სულ",
    new_order: "შეკვეთა", place_order: "შეკვეთის დამატება", where_from: "საიდან", where_to: "სად",
    saved_hint: "წინასწარ დამატებული მისამართები", no_saved: "შესაბამისი დამახსოვრებული მისამართი არ არის", assign_title: "კურიერის მიმაგრება", choose_later: "მოგვიანებით",
    in_house: "საკუთარი კურიერები", external: "გარე პროვაიდერები", cars_only: "მანქანა მჭირდება", not_connected: "დაკავშირებული არ არის",
    providers_note: "Wolt-ისა და Glovo-ს შეთავაზებები აქ გამოჩნდება ინტეგრაციის დაკავშირების შემდეგ (საჭიროა პარტნიორის წვდომა).",
    create_order: "შეკვეთის შექმნა", customer: "მომხმარებლის სახელი", weight: "წონა (კგ)", priority: "პრიორიტეტი", details: "სადარბაზო, სართული, ბინა",
    too_heavy: "ძალიან მძიმეა: ტრანსპორტი იტევს მაქს. {n} კგ", pick_on_map: "დააწკაპუნეთ რუკაზე არჩეული ველის პინის დასასმელად.", prio_normal: "ჩვეულებრივი", prio_high: "მაღალი", prio_urgent: "გადაუდებელი",
    nav_dashboard: "დაფა", nav_orders: "შეკვეთები", nav_map: "რუკა ცოცხლად", nav_reports: "ანგარიშები",
    search_global: "ძებნა: შეკვეთა, მომხმარებელი, მისამართი…", kpi_total: "სულ შეკვეთა", kpi_pending: "მოლოდინში", kpi_transit: "გზაში",
    kpi_delivered: "ჩაბარებული", kpi_failed: "ჩავარდნილი მიტანა", kpi_sub: "სულ", orders_by_zone: "შეკვეთები ზონების მიხედვით", no_zone: "ზონის გარეშე",
    recent_alerts: "ბოლო შეტყობინებები", recent_orders: "ბოლო შეკვეთები", view_all: "ყველა", quick_actions: "სწრაფი მოქმედებები",
    qa_create: "შეკვეთის შექმნა", qa_map: "რუკა", qa_zones: "ზონები", qa_address: "მისამართები",
    alert_failed: "მიტანა ჩავარდა", alert_unassigned: "კურიერი არ არის მიმაგრებული", alert_late: "მიტანის დრო გავიდა", no_alerts: "შეტყობინებები არ არის",
    export_csv: "ექსპორტი", all_status: "ყველა სტატუსი", all_zones: "ყველა ზონა", all_couriers: "ყველა კურიერი",
    col_order: "შეკვეთა", col_customer: "მომხმარებელი", col_date: "თარიღი", showing: "ნაჩვენებია {a}–{b} / {n} შეკვეთა", selected_n: "არჩეულია {n}",
    view_table: "ცხრილი", view_chart: "დიაგრამა", unassigned_courier: "მიმაგრებული არ არის",
    step_placed: "შეკვეთა მიღებულია", step_assigned: "კურიერი მიმაგრებულია", step_transit: "გზაშია", step_delivered: "ჩაბარდა",
    order_details: "შეკვეთის დეტალები", n_orders: "{n} შეკვეთა", share: "წილი",
    tab_all: "ყველა", order_info: "შეკვეთის ინფო", tracking: "თვალყური", layers: "ფენები", map_tab: "რუკა", add_order: "შეკვეთის დამატება",
    layer_orders: "შეკვეთები", created: "შეიქმნა", pickup_loc: "აყვანის ადგილი", delivery_loc: "მიტანის ადგილი", copied: "დაკოპირდა", copy_id: "ID-ის კოპირება",
    guide_line: "პირდაპირი ხაზია და არა გზის მარშრუტი.",
    order_created: "შეკვეთა შეიქმნა", pin_dropped: "პინი", dark_mode: "მუქი რეჟიმი", light_mode: "ნათელი რეჟიმი", gps_stale: "GPS არ არის ცოცხალი",
  },
} as const;

export type Key = keyof typeof D["en"];
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string };
const I18n = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => { try { const l = localStorage.getItem("lang"); if (l === "ka" || l === "en") setLangState(l); } catch {} }, []);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("lang", l); } catch {} };
  const t: Ctx["t"] = (k, vars) => {
    let s: string = D[lang][k] ?? D.en[k] ?? k;
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.replace(`{${n}}`, String(v));
    return s;
  };
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}
export const useT = () => useContext(I18n);
