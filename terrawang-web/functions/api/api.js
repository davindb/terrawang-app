const express = require("express");
const path = require("path");
const csvtojson = require("csvtojson");
const serverless = require("serverless-http");

const app = express();
const router = express.Router();

app.use(express.static(path.join(__dirname, "../dist")));
app.use(express.json());

router.get("/", (req, res) => {
  res.send("App is running..");
});

router.post("/trx", async (req, res) => {
  try {
    const jsonData = await csvtojson().fromFile(
      path.join(__dirname, "final_transactions.csv")
    );

    let { purchase_date, customer_id, limit, selected_batch } = req.body;

    if (purchase_date && !/^\d{4}-(0[1-9]|1[0-2])$/.test(purchase_date)) {
      return res.status(400).json({ error: "Invalid purchase_date format" });
    }

    customer_id = customer_id ? String(customer_id) : null;

    limit = limit ? parseInt(limit, 10) : 5;
    selected_batch = selected_batch ? parseInt(selected_batch, 10) : 1;

    const filteredData = jsonData.filter((item) => {
      return (
        (!purchase_date || item.purchase_date.startsWith(purchase_date)) &&
        (!customer_id || item.customer_id === customer_id)
      );
    });

    const sortedData = filteredData.sort((a, b) => {
      return new Date(b.purchase_date) - new Date(a.purchase_date);
    });

    const groupedData = [];
    for (let i = 0; i < sortedData.length; i += limit) {
      groupedData.push(sortedData.slice(i, i + limit));
    }

    const adjustedIndex = selected_batch - 1;

    if (adjustedIndex >= 0 && adjustedIndex < groupedData.length) {
      const selectedSubarray = groupedData[adjustedIndex];

      const responseData = {
        data: selectedSubarray.map((item) => item),
        total_data: sortedData.length,
        total_batch: groupedData.length,
        total_data_in_batch: selectedSubarray.length,
        current_batch: selected_batch,
      };

      res.json(responseData);
    } else {
      res.status(404).json({ error: "Selected subarray not found" });
    }
  } catch (error) {
    console.error("Error reading CSV file:", error);
    res.status(500).json({ error: "Internal Server Error", details: error });
  }
});

router.post("/predict_proba", async (req, res) => {
  try {
    const jsonData = await csvtojson().fromFile(
      path.join(__dirname, "final_cust_proba.csv")
    );

    let { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: "customer_id must be filled" });
    }

    customer_id = String(customer_id);

    const categoryMapping = {
      Automotive: 0,
      Beauty: 1,
      "Books & Media": 2,
      Clothing: 3,
      Electronics: 4,
      "Food & Grocery": 5,
      Furniture: 6,
      "Health & Wellness": 7,
      "Home & Kitchen": 8,
      "Jewelry & Accessories": 9,
      "Office Supplies": 10,
      "Pet Supplies": 11,
      "Sports & Outdoors": 12,
      "Toys & Games": 13,
      "": 14,
    };

    let custProba;
    try {
      custProba = jsonData.filter((item) => {
        return item.customer_id === customer_id;
      });
    } catch (error) {
      console.error("Error reading CSV file:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }

    const prediction = JSON.parse(custProba[0]["prediction"]);

    // Sorted cat
    const top_cat_keys = prediction
      .map((_, index) => index)
      .sort((a, b) => prediction[b] - prediction[a]);

    const top_cat = top_cat_keys.map(
      (index) => Object.keys(categoryMapping)[index]
    );

    // Sorted proba
    const proba = top_cat_keys.map((index) => prediction[index]);

    res.json({ customer_id, proba, top_cat });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.use("/.netlify/functions/api", router);
module.exports.handler = serverless(app);
