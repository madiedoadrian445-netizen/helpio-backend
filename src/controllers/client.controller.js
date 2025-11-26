// src/controllers/client.controller.js
import Client from "../models/Client.model.js";

// Helper: parse pagination safely
const parseIntSafe = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
};

// =======================
// CREATE CLIENT
// =======================
export const createClient = async (req, res) => {
  try {
    const {
      name,
      phone,
      phoneFormatted,
      email,
      company,
      address,
      notes,
      status,
      source,
      tags,
    } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Name is required" });
    }

    const client = await Client.create({
      name: name.trim(),
      phone: phone?.trim() || "",
      phoneFormatted: phoneFormatted?.trim() || "",
      email: email?.trim() || "",
      company: company?.trim() || "",
      address: address?.trim() || "",
      notes: notes?.trim() || "",
      status: status || "lead",
      source: source || "manual",
      tags: Array.isArray(tags) ? tags : [],
    });

    return res.status(201).json(client);
  } catch (err) {
    console.error("❌ Error creating client:", err);
    return res.status(500).json({ message: "Server error while creating client" });
  }
};

// =======================
// GET CLIENTS (search + filters + pagination)
// =======================
export const getClients = async (req, res) => {
  try {
    const {
      q,            // search text
      status,       // lead / active / inactive / blocked
      tag,          // tag filter
      archived,     // "true" | "false"
      sort = "recent", // recent | name | value | lastActivity
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseIntSafe(page, 1);
    const limitNum = parseIntSafe(limit, 20);

    const filter = {};

    // Archive filter
    if (archived === "true") {
      filter.isArchived = true;
    } else if (archived === "false" || archived === undefined) {
      filter.isArchived = false;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Tag filter
    if (tag) {
      filter.tags = tag;
    }

    // Search
    if (q && q.trim().length > 0) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { company: regex },
        { phone: regex },
      ];
    }

    // Sorting
    let sortObj = { createdAt: -1 }; // default: most recent
    if (sort === "name") {
      sortObj = { name: 1 };
    } else if (sort === "value") {
      sortObj = { totalInvoiced: -1 };
    } else if (sort === "lastActivity") {
      sortObj = { lastContactAt: -1, updatedAt: -1 };
    }

    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Client.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: clients,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching clients:", err);
    return res.status(500).json({ message: "Server error fetching clients" });
  }
};

// =======================
// GET SINGLE CLIENT
// =======================
export const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json(client);
  } catch (err) {
    console.error("❌ Error fetching client:", err);
    return res.status(500).json({ message: "Server error fetching client" });
  }
};

// =======================
// UPDATE CLIENT
// =======================
export const updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    const allowedFields = [
      "name",
      "phone",
      "phoneFormatted",
      "email",
      "company",
      "address",
      "notes",
      "status",
      "source",
      "tags",
      "totalInvoiced",
      "totalPaid",
      "lastInvoiceAt",
      "lastContactAt",
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (key in req.body) {
        updates[key] = req.body[key];
      }
    }

    const client = await Client.findByIdAndUpdate(id, updates, {
      new: true,
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json(client);
  } catch (err) {
    console.error("❌ Error updating client:", err);
    return res.status(500).json({ message: "Server error updating client" });
  }
};

// =======================
// ARCHIVE / UNARCHIVE
// =======================
export const archiveClient = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findByIdAndUpdate(
      id,
      { isArchived: true },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json(client);
  } catch (err) {
    console.error("❌ Error archiving client:", err);
    return res.status(500).json({ message: "Server error archiving client" });
  }
};

export const unarchiveClient = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findByIdAndUpdate(
      id,
      { isArchived: false },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json(client);
  } catch (err) {
    console.error("❌ Error unarchiving client:", err);
    return res.status(500).json({ message: "Server error unarchiving client" });
  }
};

// =======================
// DELETE (HARD DELETE) – optional
// =======================
export const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findByIdAndDelete(id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.status(200).json({ message: "Client deleted" });
  } catch (err) {
    console.error("❌ Error deleting client:", err);
    return res.status(500).json({ message: "Server error deleting client" });
  }
};

// =======================
// TIMELINE ENTRY
// =======================
export const addTimelineEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { type = "note", title, message, meta = {} } = req.body;

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    client.timeline.unshift({
      type,
      title,
      message,
      meta,
      createdAt: new Date(),
    });

    await client.save();

    return res.status(200).json(client);
  } catch (err) {
    console.error("❌ Error adding timeline entry:", err);
    return res.status(500).json({ message: "Server error adding timeline entry" });
  }
};
