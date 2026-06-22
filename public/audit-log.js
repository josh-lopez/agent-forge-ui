/*
 * Billing reconciliation audit log (Issue #46).
 *
 * Renders a small, static demonstration of a billing reconciliation audit
 * trail. All data below is MOCK data — there is no backend service, no API
 * call, and no real payment information. The log supports filtering by status
 * and sorting by date, entirely on the client.
 */
(function () {
  "use strict";

  // Static / mock reconciliation events. Status is one of:
  //   "matched"     – the recorded amount reconciled cleanly
  //   "discrepancy" – a difference was detected and needs attention
  //   "resolved"    – a previous discrepancy that has been reconciled
  var EVENTS = [
    {
      timestamp: "2026-02-01T09:14:00Z",
      eventType: "Invoice settlement",
      amount: 1280.0,
      status: "matched",
    },
    {
      timestamp: "2026-02-01T11:42:00Z",
      eventType: "Card capture",
      amount: 49.99,
      status: "discrepancy",
    },
    {
      timestamp: "2026-02-02T08:05:00Z",
      eventType: "Refund",
      amount: -120.5,
      status: "resolved",
    },
    {
      timestamp: "2026-02-02T16:30:00Z",
      eventType: "Subscription renewal",
      amount: 299.0,
      status: "matched",
    },
    {
      timestamp: "2026-02-03T13:18:00Z",
      eventType: "Chargeback",
      amount: -75.0,
      status: "discrepancy",
    },
    {
      timestamp: "2026-02-04T10:00:00Z",
      eventType: "Payout reconciliation",
      amount: 5400.25,
      status: "resolved",
    },
  ];

  var STATUS_LABELS = {
    matched: "Matched",
    discrepancy: "Discrepancy",
    resolved: "Resolved",
  };

  function formatTimestamp(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return iso;
    }
    return d.toLocaleString();
  }

  function formatAmount(amount) {
    var sign = amount < 0 ? "-" : "";
    return sign + "$" + Math.abs(amount).toFixed(2);
  }

  function buildRow(event) {
    var tr = document.createElement("tr");
    tr.className = "audit-log-row status-" + event.status;
    if (event.status === "discrepancy") {
      tr.setAttribute("aria-label", "Discrepancy entry");
    }

    var tsCell = document.createElement("td");
    tsCell.textContent = formatTimestamp(event.timestamp);
    tsCell.className = "col-timestamp";

    var typeCell = document.createElement("td");
    typeCell.textContent = event.eventType;
    typeCell.className = "col-event-type";

    var amountCell = document.createElement("td");
    amountCell.textContent = formatAmount(event.amount);
    amountCell.className = "col-amount";

    var statusCell = document.createElement("td");
    statusCell.className = "col-status";
    var badge = document.createElement("span");
    badge.className = "status-badge status-badge-" + event.status;
    badge.textContent = STATUS_LABELS[event.status] || event.status;
    statusCell.appendChild(badge);

    tr.appendChild(tsCell);
    tr.appendChild(typeCell);
    tr.appendChild(amountCell);
    tr.appendChild(statusCell);
    return tr;
  }

  function render() {
    var body = document.getElementById("audit-log-body");
    var empty = document.getElementById("audit-log-empty");
    var statusFilter = document.getElementById("status-filter");
    var sortOrder = document.getElementById("sort-order");
    if (!body) {
      return;
    }

    var status = statusFilter ? statusFilter.value : "all";
    var order = sortOrder ? sortOrder.value : "desc";

    var rows = EVENTS.slice();

    if (status !== "all") {
      rows = rows.filter(function (e) {
        return e.status === status;
      });
    }

    rows.sort(function (a, b) {
      var ta = new Date(a.timestamp).getTime();
      var tb = new Date(b.timestamp).getTime();
      return order === "asc" ? ta - tb : tb - ta;
    });

    body.innerHTML = "";
    rows.forEach(function (event) {
      body.appendChild(buildRow(event));
    });

    if (empty) {
      empty.hidden = rows.length !== 0;
    }
  }

  function init() {
    var statusFilter = document.getElementById("status-filter");
    var sortOrder = document.getElementById("sort-order");
    if (statusFilter) {
      statusFilter.addEventListener("change", render);
    }
    if (sortOrder) {
      sortOrder.addEventListener("change", render);
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
