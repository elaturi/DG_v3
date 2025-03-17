// ------------------ Global Loading Overlay Functions ------------------
function showGlobalLoading() {
    let overlay = document.getElementById("global-loading-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "global-loading-overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.3)";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "9999";
        overlay.innerHTML = `<div class="spinner-border text-light" role="status"><span class="visually-hidden">Loading...</span></div>`;
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = "flex";
    }
}

function hideGlobalLoading() {
    const overlay = document.getElementById("global-loading-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
}

// ------------------ Custom CSS ------------------
const customStyles = `
  <style>
    /* Plain grey buttons: no background/border, simple grey text */
    .btn-plain {
      background: none !important;
      border: none !important;
      color: #555 !important;
      padding: 0.25rem 0.5rem;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .btn-plain:hover {
      color: #333 !important;
    }
    /* Force table to full width and smaller font */
    table {
      font-size: 0.8rem;
      width: 100% !important;
    }
    /* Remove max-width constraint on narrative sections */
    .narrative {
      max-width: 100% !important;
    }
    /* Styling for visualization suggestion table */
    #visualization-suggestions table {
      margin-top: 10px;
      font-size: 0.8rem;
    }
    #visualization-suggestions input, #visualization-suggestions select {
      font-size: 0.8rem;
    }
    #visualization-output div {
      margin-top: 15px;
      border: 1px solid #ccc;
      padding: 10px;
    }
  </style>
  `;
document.head.insertAdjacentHTML("beforeend", customStyles);

// ------------------ Module Imports ------------------
import sqlite3InitModule from "https://esm.sh/@sqlite.org/sqlite-wasm@3.46.1-build3";
import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { dsvFormat, autoType } from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { markedHighlight } from "https://cdn.jsdelivr.net/npm/marked-highlight@2/+esm";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11/+esm";
import { Chart, registerables } from "https://cdn.jsdelivr.net/npm/chart.js@4/+esm";
import * as Plotly from "https://cdn.plot.ly/plotly-2.16.1.min.js";

// ------------------ Initialization ------------------
// Use a named file ("mydb.sqlite") so that changes are persistent and can be downloaded.
const defaultDB = "mydb.sqlite";
const sqlite3 = await sqlite3InitModule({ printErr: console.error });
Chart.register(...registerables);

// ------------------ DOM Elements ------------------
const $demos = document.querySelector("#demos");
const $upload = document.getElementById("upload");
const $tablesContainer = document.getElementById("tables-container");
const $sql = document.getElementById("sql");
const $toast = document.getElementById("toast");
const $result = document.getElementById("result");
const $chartCode = document.getElementById("chart-code");
const toast = new bootstrap.Toast($toast);
const loading = html`<div class="text-center my-3">
    <div class="spinner-border" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </div>`;

// Global variables: latest query result, chart instance, query history, and visualization suggestions.
let latestQueryResult = [];
let latestChart;
let queryHistory = [];
let visualizationSuggestions = []; // Array of suggestion objects

// ------------------ Markdown Setup ------------------
const marked = new Marked(
    markedHighlight({
        langPrefix: "hljs language-",
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : "plaintext";
            return hljs.highlight(code, { language }).value;
        },
    })
);
marked.use({
    renderer: {
        table(header, body) {
            return `<table class="table table-sm">${header}${body}</table>`;
        },
    },
});

// ------------------ Fetch LLM Token (Optional) ------------------
let token;
try {
    token = (
        await fetch("https://llmfoundry.straive.com/token", {
            credentials: "include",
        }).then((r) => r.json())
    ).token;
} catch {
    token = null;
}

// ------------------ Render Upload Area ------------------
render(
    token
        ? html`
          <div class="mb-3">
            <label for="file" class="form-label">
              Upload CSV (<code>.csv</code>) or SQLite DB (<code>.sqlite3</code>, <code>.db</code>)
            </label>
            <input
              class="form-control"
              type="file"
              id="file"
              name="file"
              accept=".csv,.sqlite3,.db,.sqlite,.s3db,.sl3"
              multiple
            />
          </div>
        `
        : html`<a class="btn btn-primary" href="https://llmfoundry.straive.com/">
          Sign in to upload files
        </a>`,
    $upload
);
/*
// ------------------ Demos (Optional) ------------------
fetch("config.json")
  .then((r) => r.json())
  .then(({ demos }) => {
    $demos.innerHTML = "";
    render(
      demos.map(({ title, body, file, context }) => {
        return html`
          <div class="col py-3">
            <a
              class="demo card h-100 text-decoration-none"
              href="${file}"
              data-context=${JSON.stringify(context ?? "")}
            >
              <div class="card-body">
                <h5 class="card-title">${title}</h5>
                <p class="card-text">${body}</p>
              </div>
            </a>
          </div>
        `;
      }),
      $demos
    );
  });
 
$demos.addEventListener("click", async (e) => {
  const $demo = e.target.closest(".demo");
  if ($demo) {
    e.preventDefault();
    showGlobalLoading();
    const file = $demo.getAttribute("href");
    render(loading, $tablesContainer);
    await DB.upload(
      new File([await fetch(file).then((r) => r.blob())], file.split("/").pop())
    );
    DB.context = JSON.parse($demo.dataset.context || "");
    drawTables();
    hideGlobalLoading();
  }
});
*/
// ------------------ SQLite DB Manager ------------------
const db = new sqlite3.oo1.DB(defaultDB, "c");
const DB = {
    context: "",
    schema: function () {
        let tables = [];
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='table'", {
            rowMode: "object",
        }).forEach((table) => {
            table.columns = db.exec(`PRAGMA table_info(${table.name})`, {
                rowMode: "object",
            });
            tables.push(table);
        });
        return tables;
    },
    upload: async function (file) {
        if (file.name.match(/\.(sqlite3|sqlite|db|s3db|sl3)$/i)) {
            await DB.uploadSQLite(file);
        } else if (file.name.match(/\.csv$/i)) {
            await DB.uploadDSV(file, ",");
        } else if (file.name.match(/\.tsv$/i)) {
            await DB.uploadDSV(file, "\t");
        } else {
            notify("danger", "Unknown file type", file.name);
        }
    },
    uploadSQLite: async function (file) {
        const fileReader = new FileReader();
        await new Promise((resolve) => {
            fileReader.onload = async (e) => {
                await sqlite3.capi.sqlite3_js_posix_create_file(
                    file.name,
                    e.target.result
                );
                // Copy tables into main DB
                const uploadDB = new sqlite3.oo1.DB(file.name, "r");
                const tables = uploadDB.exec(
                    "SELECT name, sql FROM sqlite_master WHERE type='table'",
                    { rowMode: "object" }
                );
                for (const { name, sql } of tables) {
                    db.exec(`DROP TABLE IF EXISTS "${name}"`);
                    db.exec(sql);
                    const data = uploadDB.exec(`SELECT * FROM "${name}"`, {
                        rowMode: "object",
                    });
                    if (data.length > 0) {
                        const columns = Object.keys(data[0]);
                        const insertSQL = `INSERT INTO "${name}" (${columns
                            .map((c) => `"${c}"`)
                            .join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
                        const stmt = db.prepare(insertSQL);
                        db.exec("BEGIN TRANSACTION");
                        for (const row of data) {
                            stmt.bind(columns.map((c) => row[c])).stepReset();
                        }
                        db.exec("COMMIT");
                        stmt.finalize();
                    }
                }
                uploadDB.close();
                resolve();
            };
            fileReader.readAsArrayBuffer(file);
        });
        notify("success", "Imported", `Imported SQLite DB: ${file.name}`);
    },

    uploadDSV: async function (file, separator) {
        const fileReader = new FileReader();
        const result = await new Promise((resolve) => {
            fileReader.onload = (e) => {
                const rows = dsvFormat(separator).parse(e.target.result, autoType);
                resolve(rows);
            };
            fileReader.readAsText(file);
        });

        const tableName = file.name
            .slice(0, -4)
            .replace(/[^a-zA-Z0-9_]/g, "_");

        await DB.insertRows(tableName, result);
    },

    insertRows: async function (tableName, rows) {
        if (!rows.length) return;
    
        let cols = Object.keys(rows[0]);
        const typeMap = {};
        console.log(cols);
    
        for (let col of cols) {
            const sampleValue = rows[0][col];
            console.log(typeof (sampleValue), sampleValue);
            if (typeof sampleValue === "string") {
                // Check for valid date-time formats
                if (sampleValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    console.log("only date (YYYY-MM-DD)");
                    typeMap[col] = "TEXT";
                } else if (sampleValue.match(/^\d{2}:\d{2}:\d{2}$/)) {
                    console.log("only time (HH:MM:SS)");
                    typeMap[col] = "TEXT";
                } else if (sampleValue.match(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/)) {
                    console.log(sampleValue, "date time (DD-MM-YYYY)");
                    const dateCol = `${col}_date`;
                    const timeCol = `${col}_time`;
    
                    typeMap[dateCol] = "TEXT";
                    typeMap[timeCol] = "TEXT";
                } else if (sampleValue.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
                    console.log(sampleValue, "date time (YYYY-MM-DD)");
                    const dateCol = `${col}_date`;
                    const timeCol = `${col}_time`;
    
                    typeMap[dateCol] = "TEXT";
                    typeMap[timeCol] = "TEXT";
                } else {
                    console.log("else ");
                    typeMap[col] = "TEXT";
                }
            } else if (typeof sampleValue === "number") {
                typeMap[col] = Number.isInteger(sampleValue) ? "INTEGER" : "REAL";
            } else if (typeof sampleValue === "boolean") {
                typeMap[col] = "INTEGER";
            } else if (sampleValue instanceof Date) {
                typeMap[col] = "TEXT";
            }
        }
    
        console.log(typeMap);
    
        // Create SQL table with modified columns
        const createSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (
            ${Object.keys(typeMap).map((col) => `"${col}" ${typeMap[col]}`).join(", ")}
        )`;
        db.exec(createSQL);
    
        // Prepare insert statement
        let newCols = Object.keys(typeMap);
        const insertSQL = `INSERT INTO ${tableName} (${newCols.map((c) => `"${c}"`).join(", ")}) VALUES (${newCols.map(() => "?").join(", ")})`;
    
        const stmt = db.prepare(insertSQL);
        db.exec("BEGIN TRANSACTION");
        console.log(newCols);
    
        for (const row of rows) {
            let values = [];
            for (let col of newCols) {
                if (col.endsWith("_date") || col.endsWith("_time")) {
                    let originalCol = col.replace(/_(date|time)$/, "");
                    if (row[originalCol]) {
                        // Adjusted to support both formats
                        let regexDateTime = /^(?:(\d{4}-\d{2}-\d{2})|(\d{2}-\d{2}-\d{4})) (\d{2}:\d{2})(?::\d{2})?$/;
                        let matches = row[originalCol].match(regexDateTime);
                        if (matches) {
                            let datePart = matches[1] || matches[2]; // YYYY-MM-DD or DD-MM-YYYY
                            let timePart = matches[3];
                            // For Date Formatting need to swap if from DD-MM-YYYY to YYYY-MM-DD
                            if (matches[2]) {
                                const [day, month, year] = datePart.split('-');
                                datePart = `${year}-${month}-${day}`; // convert to YYYY-MM-DD
                            }
    
                            if (col.endsWith("_date")) {
                                values.push(datePart);
                            } else if (col.endsWith("_time")) {
                                values.push(timePart);
                            }
                        } else {
                            console.warn(`Invalid date format for column: ${originalCol}, Value: ${row[originalCol]}`);
                            values.push(null); // Handle as necessary
                        }
                    } else {
                        values.push(null);
                    }
                } else {
                    values.push(row[col] instanceof Date ? row[col].toISOString() : row[col]);
                }
            }
            stmt.bind(values).stepReset();
        }
    
        db.exec("COMMIT");
        stmt.finalize();
    
        notify("success", "Imported", `Imported table: ${tableName}`);
    }
};


// ------------------ Handle File Selection ------------------
$upload.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    for (let file of files) {
        await DB.upload(file);
    }
    drawTables();
});

// ------------------ Draw Tables & Column UI ------------------
async function drawTables() {
    const schema = DB.schema();
    if (!schema.length) {
        render(html`<p>No tables available.</p>`, $tablesContainer);
        return;
    }
    const content = html`
      <div class="accordion narrative mx-auto" id="table-accordion">
        ${schema.map(({ name, sql, columns }) => {
        return html`
            <div class="accordion-item my-2">
              <h2 class="accordion-header">
                <button
                  class="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#collapse-${name}"
                  aria-expanded="false"
                  aria-controls="collapse-${name}"
                >
                  ${name}
                </button>
              </h2>
              <div
                id="collapse-${name}"
                class="accordion-collapse collapse"
                data-bs-parent="#table-accordion"
              >
                <div class="accordion-body">
                  <pre style="white-space: pre-wrap">${sql}</pre>
                  <!-- Table of columns -->
                  <form class="row g-3" data-table="${name}">
                    <table class="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th>Column Name</th>
                          <th>Type</th>
                          <th>Not Null</th>
                          <th>Default</th>
                          <th>Primary Key</th>
                          <th>Method (LLM or SQL)</th>
                          <th>Prompt</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${columns.map((col) => {
            return html`
                            <tr>
                              <td>${col.name}</td>
                              <td>${col.type}</td>
                              <td>${col.notnull ? "Yes" : "No"}</td>
                              <td>${col.dflt_value ?? "NULL"}</td>
                              <td>${col.pk ? "Yes" : "No"}</td>
                              <td>
                                <select class="form-select" name="method-${col.name}">
                                  <option value="">(none)</option>
                                  <option value="SQL">SQL</option>
                                  <option value="LLM">LLM</option>
                                </select>
                              </td>
                              <td>
                                <input type="hidden" name="prompt-${col.name}" value="" />
                                <button
                                  type="button"
                                  class="btn-plain edit-prompt"
                                  data-table="${name}"
                                  data-col="${col.name}"
                                  title="Edit Prompt"
                                >
                                  <i class="bi bi-pencil"></i>
                                </button>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  class="btn-plain update-column"
                                  data-col="${col.name}"
                                  title="Update"
                                >
                                  <i class="bi bi-pencil-square"></i>
                                </button>
                                <button
                                  type="button"
                                  class="btn-plain remove-column"
                                  data-col="${col.name}"
                                  title="Remove"
                                >
                                  <i class="bi bi-trash"></i>
                                </button>
                              </td>
                            </tr>
                          `;
        })}
                        <!-- Row to add a new column -->
                        <tr>
                          <td>
                            <input
                              type="text"
                              class="form-control"
                              placeholder="New Col Name"
                              name="new-col-name"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              class="form-control"
                              placeholder="TEXT"
                              name="new-col-type"
                            />
                          </td>
                          <td colspan="1"></td>
                          <td colspan="1"></td>
                          <td colspan="1"></td>
                          <td>
                            <select class="form-select" name="new-col-method">
                              <option value="">(none)</option>
                              <option value="SQL">SQL</option>
                              <option value="LLM">LLM</option>
                            </select>
                          </td>
                          <td>
                            <input type="hidden" name="new-col-prompt" value="" />
                            <button
                              type="button"
                              class="btn-plain edit-prompt"
                              data-table="${name}"
                              data-col="new-col"
                              data-new="true"
                              title="Edit Prompt"
                            >
                              <i class="bi bi-pencil"></i>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              class="btn-plain add-column"
                              title="Add"
                            >
                              <i class="bi bi-plus-circle"></i>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </form>
                </div>
              </div>
            </div>
          `;
    })}
      </div>
      <!-- Query form -->
      <form class="mt-4 narrative mx-auto" id="question-form">
        <div class="mb-3">
          <label for="context" class="form-label fw-bold">
            Provide context about your dataset:
          </label>
          <textarea class="form-control" name="context" id="context" rows="3">
  ${DB.context}</textarea>
        </div>
        <div class="mb-3">
          <label for="query" class="form-label fw-bold">
            Ask a question about your data:
          </label>
          <textarea class="form-control" name="query" id="query" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit</button>
        <div class="text-center my-3">
        <button id="create-dashboard-button" type="button" class="btn btn-success">Create Dashboard</button>
      </div>
      </form>
    `;
    render(content, $tablesContainer);
    // Attach events for column update/remove/add and prompt editing.
    const $forms = $tablesContainer.querySelectorAll("form");
    $forms.forEach(($form) => {
        if ($form.id === "question-form") {
            $form.addEventListener("submit", onQuerySubmit);
        } else {
            $form.addEventListener("click", async (e) => {
                const tableName = $form.dataset.table;
                const $btn = e.target.closest("button");
                if (!$btn) return;
                if ($btn.classList.contains("update-column")) {
                    const colName = $btn.dataset.col;
                    const methodSelect = $form.querySelector(`[name="method-${colName}"]`);
                    const promptInput = $form.querySelector(`[name="prompt-${colName}"]`);
                    await updateColumn(tableName, colName, methodSelect.value, promptInput.value);
                    drawTables();
                } else if ($btn.classList.contains("remove-column")) {
                    const colName = $btn.dataset.col;
                    await removeColumn(tableName, colName);
                    drawTables();
                } else if ($btn.classList.contains("add-column")) {
                    const colName = $form.querySelector("[name='new-col-name']").value.trim();
                    const colType = $form.querySelector("[name='new-col-type']").value.trim() || "TEXT";
                    const method = $form.querySelector("[name='new-col-method']").value;
                    const promptInput = $form.querySelector("[name='new-col-prompt']");
                    const prompt = promptInput ? promptInput.value : "";
                    if (colName) {
                        await addColumn(tableName, colName, colType, method, prompt);
                        drawTables();
                    }
                }
            });
        }
    });
}

// ------------------ Query Form Submission ------------------
async function onQuerySubmit(e) {
    e.preventDefault();
    showGlobalLoading();
    try {
        const formData = new FormData(e.target);
        const query = formData.get("query");
        DB.context = formData.get("context") || "";
        render(loading, $sql);
        render("", $result);

        // Use LLM to generate SQL for the main query.
        const result = await llm({
            system: `You are an expert SQLite query writer. The user has a SQLite dataset.
  
  ${DB.context}
  
  The schema is:
  
  ${DB.schema().map(({ sql }) => sql).join("\n\n")}
  
  Answer the user's question by describing steps, then output final SQL code (SQLite).`,
            user: query,
        });
        render(html`${unsafeHTML(marked.parse(result))}`, $sql);

        const sqlCode = result.match(/```.*?\n([\s\S]*?)```/);
        const extractedSQL = sqlCode ? sqlCode[1] : result;
        queryHistory.push("Main Query:\n" + extractedSQL);
        try {
            const rows = db.exec(extractedSQL, { rowMode: "object" });
            if (rows.length > 0) {
                latestQueryResult = rows;
                // Render results table, Summary and Visualizations sections
                render(html`
            <details>
              <summary style="cursor: pointer; font-weight: bold;">View Query Results</summary>
              <div style="padding: 10px;">
                ${renderTable(rows.slice(0, 100))}
              </div>
             </details>
            <div class="accordion mt-3" id="resultAccordion">
              <div class="accordion-item">
                <h2 class="accordion-header">
                  <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#summaryCollapse">
                    Summary
                  </button>
                </h2>
                <div id="summaryCollapse" class="accordion-collapse collapse">
                  <div class="accordion-body">
                    <button id="download-csv" class="btn-plain">
                      <i class="bi bi-filetype-csv"></i> Download CSV
                    </button>
                    <button id="download-db" class="btn-plain">
                      <i class="bi bi-download"></i> Download DB
                    </button>
                    <div class="mt-2">
                      <details>
                        <summary>Query Details</summary>
                        <pre style="white-space: pre-wrap;">${queryHistory.join("\n\n")}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
              <div class="accordion-item">
                <h2 class="accordion-header">
                  <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#visualizationCollapse">
                    Visualizations
                  </button>
                </h2>
                <div id="visualizationCollapse" class="accordion-collapse collapse">
                  <div class="accordion-body">
                    <button id="suggest-visualizations" class="btn-plain">
                      Suggest Visualizations
                    </button>
                    <div id="visualization-suggestions"></div>
                    <div id="visualization-output"></div>
                  </div>
                </div>
              </div>
            </div>
          `, $result);
                document.getElementById("download-csv").addEventListener("click", () => {
                    download(dsvFormat(",").format(latestQueryResult), "datachat.csv", "text/csv");
                });
                document.getElementById("download-db").addEventListener("click", downloadDB);
                document.getElementById("suggest-visualizations").addEventListener("click", suggestVisualizations);
            } else {
                render(html`<p>No results found.</p>`, $result);
            }
        } catch (err) {
            render(html`<div class="alert alert-danger">${err.message}</div>`, $result);
        }
    } finally {
        hideGlobalLoading();
    }
}

$tablesContainer.addEventListener("click", async (e) => {
    // Handle "Create Dashboard" button click
    const $createDashboardButton = e.target.closest("#create-dashboard-button");

    console.log($createDashboardButton)
    if ($createDashboardButton) {
        $createDashboardButton.disabled = true;
        await createDashboard();
    }
    $createDashboardButton.disabled = false;
});

async function llm({ system, user, schema }) {
    const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}:datachat` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            temperature: 0,
            ...(schema ? { response_format: { type: "json_schema", json_schema: { name: "response", strict: true, schema } } } : {}),
        }),
    }).then((r) => r.json());
    if (response.error) return response;
    const content = response.choices?.[0]?.message?.content;
    try {
        return schema ? JSON.parse(content) : content;
    } catch (e) {
        return { error: e };
    }
}

// Function to create dashboard
async function createDashboard() {
    console.log("Creating dashboard...");
    const schema = DB.schema();
    if (!schema || schema.length === 0) {
        notify("warning", "No Data", "Please upload a CSV or SQLite database first.");
        return;
    }

    render(html`<div class="text-center my-3">${loading}</div>`, $sql); // Use $sql to display loading
    render(html``, $result); // Clear the result area

    const systemPrompt = `You are a helpful assistant that generates a dashboard configuration for a SQLite database.  Given the database schema, you will generate a JSON object describing a dashboard with multiple charts.
  
    The JSON object should have the following structure:
  
    \`\`\`json
    {
      "dashboardTitle": "Dashboard Title",
      "description": "Overall description of the dashboard",
      "charts": [
        {
          "title": "Chart Title",
          "description": "Description of the chart and what it visualizes",
          "chartType": "bar" or "line" or "pie" or "scatter" or "doughnut" or "radar" or "polarArea",
          "sqlQuery": "SELECT ... FROM ...",
          "xLabel": "Label for the X-axis",
          "yLabel": "Label for the Y-axis"
        },
        // ... more charts
      ]
    }
    \`\`\`
  
    *   \`dashboardTitle\`: A concise title for the entire dashboard.
    *   \`description\`: A brief overview of the dashboard's purpose and the data it presents.
    *   \`charts\`: An array of chart objects.
        *   \`title\`: A descriptive title for the chart.
        *   \`description\`: A short explanation of what the chart shows.
        *   \`chartType\`: The type of chart to use (e.g., "bar", "line", "pie"). Choose the most appropriate chart type for the data.
        *   \`sqlQuery\`: The SQL query to fetch the data for the chart.  Use SQLite syntax.  The query should select the necessary data for the chart.
        *   \`xAxisLabel\`: Label for the X-axis.
        *   \`yAxisLabel\`: Label for the Y-axis.
  
    Consider the relationships between tables when generating queries.  Generate 6-7 diverse and useful charts.
    `;

    const userPrompt = `Here is the SQLite database schema:
    ${DB.schema()
            .map(({ sql }) => sql)
            .join("\n\n")}
  
    Context: ${DB.context}
    `;

    const dashboardResponse = await llm({
        system: systemPrompt,
        user: userPrompt,

        schema: {
            type: "object",
            additionalProperties: false,
            properties: {
                dashboardTitle: { type: "string", description: "Title of the dashboard", additionalProperties: false },
                description: { type: "string", description: "Description of the dashboard", additionalProperties: false },
                charts: {
                    type: "array",
                    additionalProperties: false,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            title: { type: "string", description: "Title of the chart", additionalProperties: false },
                            description: { type: "string", description: "Description of the chart", additionalProperties: false },
                            chartType: {
                                type: "string",
                                enum: ["bar", "line", "pie", "scatter", "doughnut", "radar", "polarArea"],
                                description: "Type of chart",
                                additionalProperties: false,
                            },
                            sqlQuery: { type: "string", description: "SQL query to get the chart data", additionalProperties: false },
                            xAxisLabel: { type: "string", description: "Label for the X-axis", additionalProperties: false },
                            yAxisLabel: { type: "string", description: "Label for the Y-axis", additionalProperties: false },
                        },
                        required: ["title", "description", "chartType", "sqlQuery", "xAxisLabel", "yAxisLabel"],
                    },
                    description: "Array of charts to display",
                },
            },
            required: ["dashboardTitle", "description", "charts"],
        },
    });

    if (dashboardResponse.error) {
        console.error("Dashboard generation error:", dashboardResponse.error);
        notify("danger", "Dashboard Generation Error", JSON.stringify(dashboardResponse.error));
        render(html``, $sql);
        return;
    }


    const dashboardConfig = dashboardResponse;
    console.log("Dashboard Configuration:", dashboardResponse);
    render(html``, $sql); // Clear loading
    // --------------------------------------------------------------------
    // Second LLM call to generate chart code
    await generateAndRenderCharts(dashboardConfig);
}

async function generateAndRenderCharts(dashboardConfig) {
    const chartCodePromises = dashboardConfig.charts.map(async (chart, index) => {
        console.log(chart, index);
        const systemPrompt = `You are an expert Chart.js code generator.  Given a SQL query and chart details, generate the JavaScript code to create a Chart.js chart.
  
      The data from the SQL query will be available as a JavaScript array of objects named \`data\`.  You do NOT need to execute the SQL query.  Assume the data is already available in the \`data\` variable.
  
      Generate the chart code inside a \`\`\`js code fence.  The code should create a Chart.js chart and render it inside a <canvas> element with the ID "chart-${index}".
  
      Here's the basic structure:
  
      \`\`\`js
      new Chart(document.getElementById("chart-${index}"), {
        type: 'bar', // or 'line', 'pie', etc.
        data: {
          labels: [], // X-axis labels
          datasets: [{
            label: '', // Dataset label
            data: [], // Y-axis data
            backgroundColor: [], // Colors
            borderColor: [], // Border colors
            borderWidth: 1
          }]
        },
        options: {
          // Chart options 
        }
      });
      \`\`\`
  
      Use the chart type, labels, datasets, and options to create a visually appealing and informative chart. Make sure to use the xLabel and yLabel in the options. 
      *Special Note - Do not declare data response since it causes SyntaxError: Identifier 'data' has already been declared.
      `;

        const userPrompt = `Here are the chart details:
      Chart Title: ${chart.title}
      Description: ${chart.description}
      Chart Type: ${chart.chartType}
      SQL Query: ${chart.sqlQuery}
      X-Axis Label: ${chart.xAxisLabel}
      Y-Axis Label: ${chart.yAxisLabel}
      `;

        const chartCodeResponse = await llm({
            system: systemPrompt,
            user: userPrompt,
        });
        // console.log(chartCodeResponse);
        if (chartCodeResponse.error) {
            console.error(`Chart code generation error for chart "${chart.title}":`, chartCodeResponse.error);
            notify("danger", `Chart Generation Error for "${chart.title}"`, JSON.stringify(chartCodeResponse.error));
            return null;
        }

        const code = chartCodeResponse.match(/```js\n(.*?)\n```/s)?.[1];
        if (!code) {
            console.error(`Could not extract chart code for chart "${chart.title}"`);
            notify("danger", `Chart Generation Error for "${chart.title}"`, "Could not generate chart code");
            return null;
        }

        return { index, code, chart };
    });

    const chartCodeResults = await Promise.all(chartCodePromises);

    renderDashboard(dashboardConfig, chartCodeResults);
}

function renderDashboard(dashboardConfig, chartCodeResults) {
    console.log(dashboardConfig, chartCodeResults);
    const dashboardHtml = html`
      <div class="container-fluid">
        <h1 class="mt-4 mb-3">${dashboardConfig.dashboardTitle}</h1>
        <p class="lead">${dashboardConfig.description}</p>
        <div class="grid-stack">
                ${chartCodeResults.map((result, i) => {
                    if (!result) return html`<div class="grid-stack-item">Error generating chart</div>`;
                    const { index, chart } = result;
                    
                    return html`
                        <div class="grid-stack-item" gs-w="4" gs-h="3" gs-min-w="3" gs-min-h="2">
                            <div class="card w-100 shadow">
                                <div class="card-body">
                                    <h5 class="card-title">${chart.title}</h5>
                                    <p class="card-text">${chart.description}</p>
                                    <canvas id="chart-${index}" class="chart-expandable"></canvas>
                                </div>
                            </div>
                        </div>
              ${i % 3 === 2 ? '</div><div class="row">' : ''}
            `;
          })}
        </div>
      </div>
    `;

    render(dashboardHtml, $result);

    // Initialize Gridstack.js
    const grid = GridStack.init({
        cellHeight: 120,   // Default height per grid row
        float: true,       // Allow free movement
        animate: true      // Smooth transitions
    });

  

    chartCodeResults.forEach(async (result) => {
        if (!result) return;
        const { index, code, chart } = result;
        
        try {
            console.log(chart.sqlQuery);
            const data = db.exec(chart.sqlQuery, { rowMode: "object" });
            console.log(data);
    
            // Generate Chart
            const drawChart = new Function("Chart", "data", code);
            drawChart(Chart, data);
        } catch (error) {
            console.error(`Failed to draw chart "${chart.title}":`, error);
            notify("danger", `Chart Rendering Error for "${chart.title}"`, `Failed to draw chart: ${error.message}`);
        }
    });
    // Enable full-screen charts on click
    document.querySelectorAll(".chart-expandable").forEach(canvas => {
        canvas.addEventListener("click", () => expandChart(canvas));
    });
}


function expandChart(canvas) {
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100vw";
    modal.style.height = "100vh";
    modal.style.background = "rgba(0,0,0,0.8)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "1000";

    const clonedCanvas = canvas.cloneNode(true);
    clonedCanvas.style.width = "80vw";
    clonedCanvas.style.height = "80vh";
    clonedCanvas.style.background = "#fff";

    modal.appendChild(clonedCanvas);
    document.body.appendChild(modal);

    // Close on click
    modal.addEventListener("click", () => {
        document.body.removeChild(modal);
    });

    // Re-draw chart in modal
    const chartIndex = canvas.id.split("-")[1];
    const result = chartCodeResults[chartIndex];
    if (result) {
        const { code } = result;
        const data = db.exec(result.chart.sqlQuery, { rowMode: "object" });
        const drawChart = new Function("Chart", "data", code);
        drawChart(Chart, data);
    }
}


// ------------------ Column Operations ------------------
async function addColumn(table, colName, colType, method, prompt) {
    try {
        const alterSQL = `ALTER TABLE [${table}] ADD COLUMN [${colName}] ${colType}`;
        db.exec(alterSQL);
        queryHistory.push(alterSQL);
    } catch (err) {
        notify("danger", "Add Column Error", err.message);
        return;
    }
    notify("success", "Added Column", `Column [${colName}] added to [${table}].`);
    if (!method) return;
    await updateColumn(table, colName, method, prompt);
}

async function removeColumn(table, colName) {
    try {
        const dropSQL = `ALTER TABLE [${table}] DROP COLUMN [${colName}]`;
        db.exec(dropSQL);
        queryHistory.push(dropSQL);
        notify("success", "Removed Column", `Column [${colName}] removed.`);
    } catch (err) {
        notify("danger", "Remove Column Error", "SQLite version may not support DROP COLUMN.\n" + err.message);
    }
}

async function updateColumn(table, colName, method, prompt) {
    if (!method || !prompt) {
        notify("warning", "No Method/Prompt", "Method or prompt is empty");
        return;
    }
    if (method === "SQL") {
        const msg = await llm({
            system: `You are an expert at writing SQLite queries.
  The user has asked to update column [${colName}] in table [${table}].
  They have provided a 'prompt' describing how to fill that column:
  "${prompt}"
  The current schema is:
  ${DB.schema().map(({ sql }) => sql).join("\n\n")}
  Write a single SQLite UPDATE statement to fill or transform [${colName}] for all rows. Use valid SQLite syntax. No extra commentary—only code.`,
            user: "",
        });
        const sqlCode = msg.match(/```.*?\n([\s\S]*?)```/);
        const extractedSQL = sqlCode ? sqlCode[1] : msg;
        try {
            db.exec(extractedSQL);
            queryHistory.push(extractedSQL);
            notify("success", "SQL Update", `Updated column [${colName}] in [${table}].`);
        } catch (err) {
            notify("danger", "SQL Update Error", err.message);
        }
    } else {
        try {
            const data = db.exec(`SELECT rowid, * FROM [${table}]`, { rowMode: "object" });
            if (!data.length) {
                notify("warning", "No data", "Table is empty.");
                return;
            }
            const columns = Object.keys(data[0]).filter((c) => c !== colName && c !== "rowid");
            const chunkSize = 100;
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                // Process LLM responses concurrently for the chunk.
                const responses = await Promise.all(
                    chunk.map((row) => {
                        const rowContent = JSON.stringify(
                            Object.fromEntries(columns.map((c) => [c, row[c]]))
                        );
                        return llm({
                            system: `You are given the user prompt: "${prompt}" 
  The data for this row is: ${rowContent}
  Return only the new value for column [${colName}]. No extra text.`,
                            user: "",
                        }).then((resp) => resp.replace(/```[\s\S]*?```/gs, "").trim());
                    })
                );
                db.exec("BEGIN TRANSACTION");
                for (let j = 0; j < chunk.length; j++) {
                    const row = chunk[j];
                    const newValue = responses[j];
                    const stmt = db.prepare(`UPDATE [${table}] SET [${colName}]=? WHERE rowid=?`);
                    stmt.bind([newValue, row.rowid]).step();
                    stmt.finalize();
                }
                db.exec("COMMIT");
            }
            queryHistory.push(`LLM update applied to column [${colName}] in table [${table}].`);
            notify("success", "LLM Update", `Updated column [${colName}] with LLM logic.`);
        } catch (err) {
            try {
                db.exec("ROLLBACK");
            } catch (_) { }
            notify("danger", "LLM Update Error", err.message);
        }
    }
}

// ------------------ Visualization Functions ------------------
async function suggestVisualizations() {
    showGlobalLoading();
    try {
        if (!latestQueryResult.length) {
            notify("warning", "No Data", "No query result available to base suggestions on.");
            return;
        }
        // Create metadata from latestQueryResult
        const metadata = {
            columns: Object.keys(latestQueryResult[0] || {}),
            rowCount: latestQueryResult.length,
            sampleData: latestQueryResult.slice(0, 3)
        };
        const prompt = `You are an expert data visualization advisor. Given the following data metadata:
  Columns: ${JSON.stringify(metadata.columns)}
  Row Count: ${metadata.rowCount}
  Sample Data: ${JSON.stringify(metadata.sampleData)}
  Please suggest several visualization ideas. Return a JSON array (no extra text) where each element is an object with the following keys:
  - chartName: a suggested chart name,
  - chartPrompt: a prompt for creating the chart using Plotly.js,
  - fields: the fields that should be used,
  - chartType: the type of chart (e.g. scatter, bar, line, etc).`;

        const response = await llm({ system: prompt, user: "" });
        console.log(response)
        try {
            visualizationSuggestions = JSON.parse(response);
        } catch (e) {
            const match = response.match(/```(?:json)?\n([\s\S]*?)```/);
            if (match) {
                visualizationSuggestions = JSON.parse(match[1]);
            } else {
                notify("danger", "Visualization Suggestion Error", "Could not parse visualization suggestions.");
                return;
            }
        }
        renderVisualizationSuggestions();
    } finally {
        hideGlobalLoading();
    }
}

function renderVisualizationSuggestions() {
    if (!visualizationSuggestions.length) return;
    const suggestionTable = html`
      <table class="table table-bordered">
        <thead>
          <tr>
            <th>Chart Name</th>
            <th>Chart Prompt</th>
            <th>Fields</th>
            <th>Chart Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${visualizationSuggestions.map((suggestion, index) => html`
            <tr>
              <td><input type="text" class="form-control" value="${suggestion.chartName}" data-index="${index}" data-key="chartName" /></td>
              <td><input type="text" class="form-control" value="${suggestion.chartPrompt}" data-index="${index}" data-key="chartPrompt" /></td>
              <td><input type="text" class="form-control" value="${suggestion.fields}" data-index="${index}" data-key="fields" /></td>
              <td><input type="text" class="form-control" value="${suggestion.chartType}" data-index="${index}" data-key="chartType" /></td>
              <td>
                <button class="btn btn-primary" onclick="${generateGraph(index)}">
                  Generate Graph
                </button>
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
    render(suggestionTable, document.getElementById("visualization-suggestions"));
    document.querySelectorAll("#visualization-suggestions input").forEach(input => {
        input.addEventListener("change", (e) => {
            const idx = e.target.getAttribute("data-index");
            const key = e.target.getAttribute("data-key");
            visualizationSuggestions[idx][key] = e.target.value;
        });
    });
}

async function generateGraph(index) {
    console.log("graph generated")
    showGlobalLoading();
    try {
        const suggestion = visualizationSuggestions[index];
        if (!suggestion) return;
        const containerId = `plotly-chart-${index}`;
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement("div");
            container.id = containerId;
            document.getElementById("visualization-output").appendChild(container);
        }
        // Show loading spinner in the container
        container.innerHTML = `<div class="text-center my-3">
        <div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>
      </div>`;

        const system = `You are an expert plotly.js code generator.Given a SQL query and chart details, generate the JavaScript code to create a plotly.js chart.
      The data from the SQL query will be available as a JavaScript array of objects named \`data\`.  You do NOT need to execute the SQL query.  Assume the data is already available in the \`data\` variable. Using the following suggestion JSON: ${JSON.stringify(suggestion, null, 2)} Generate JavaScript code that creates a Plotly chart for the provided data .Render the chart in a div with id "${containerId}".Generate the chart code inside a \`\`\`js code fence.The generated Plotly chart must include a "layout" object with width: 1000, height: 500, and autosize: true. add css also for big view.
      Here's the basic structure:
  
      \`\`\`js
      new Chart(document.getElementById("chart-${index}"), {
        type: 'bar', // or 'line', 'pie', etc.
        data: {
          labels: [], // X-axis labels
          datasets: [{
            label: '', // Dataset label
            data: [], // Y-axis data
            backgroundColor: [], // Colors
            borderColor: [], // Border colors
            borderWidth: 1
          }]
        },
        options: {
          // Chart options 
        }
      });
      \`\`\`  
      `;
        const response = await llm({ system, user: "" });
        //   console.log(response)
        const codeMatch = response.match(/```js\n([\s\S]*?)\n```/);
        console.log(codeMatch)
        if (!codeMatch) {
            notify("danger", "Graph Generation Error", "Could not extract code from LLM response.");
            container.innerHTML = "";
            return;
        }
        const code = codeMatch[1];
        console.log(code);
        try {
            const drawGraph = new Function("data", code);
            console.log(drawGraph);
            container.innerHTML = ""; // Clear loading spinner
            console.log(latestQueryResult);
            drawGraph(latestQueryResult);
            notify("success", "Graph Generated", `Graph for "${suggestion.chartName}" generated.`);
        } catch (err) {
            container.innerHTML = "";
            notify("danger", "Graph Execution Error", err.message);
        }
    } finally {
        hideGlobalLoading();
    }
}
/*
// ------------------ LLM Helper ------------------
async function llm({ system, user }) {
  if (!token) {
    return `LLM token not found. Cannot call LLM.\n\n[System]\n${system}\n\n[User]\n${user}`;
  }
  const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}:datachat`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    }),
  }).then((r) => r.json());
  if (response.error) return `Error: ${JSON.stringify(response.error)}`;
  return response.choices?.[0]?.message?.content || "";
}
*/
// ------------------ Utility: Render Table ------------------
function renderTable(data) {
    if (!data.length) return html`<p>No data.</p>`;
    const cols = Object.keys(data[0]);
    return html`
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            ${cols.map((c) => html`<th>${c}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${data.map((row) => html`
            <tr>
              ${cols.map((c) => html`<td>${row[c]}</td>`)}
            </tr>
          `)}
        </tbody>
      </table>
    `;
}

// ------------------ Download DB Function ------------------
function downloadDB() {
    try {
        const data = sqlite3.capi.FS.readFile(defaultDB);
        const blob = new Blob([data.buffer], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = defaultDB;
        link.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        notify("danger", "Download DB Error", e.message);
    }
}

// ------------------ Simple Toast ------------------
function notify(cls, title, message) {
    $toast.querySelector(".toast-title").textContent = title;
    $toast.querySelector(".toast-body").textContent = message;
    const $toastHeader = $toast.querySelector(".toast-header");
    $toastHeader.classList.remove("text-bg-success", "text-bg-danger", "text-bg-warning", "text-bg-info");
    $toastHeader.classList.add(`text-bg-${cls}`);
    toast.show();
}

function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// ------------------ Modal for Editing Prompt ------------------
const modalHtml = html`
   <div class="modal fade" id="promptModal" tabindex="-1" aria-labelledby="promptModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="promptModalLabel">Edit Prompt</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <textarea class="form-control" id="promptModalTextarea" rows="5" placeholder="Enter your prompt here"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-plain" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn-plain" id="promptModalSave">Save</button>
        </div>
      </div>
    </div>
  </div>
  `;



document.body.insertAdjacentHTML("beforeend", promptModalHTML);

document.addEventListener("click", (e) => {
    const target = e.target.closest(".edit-prompt");
    if (target) {
        const table = target.getAttribute("data-table");
        const col = target.getAttribute("data-col");
        const form = target.closest("form");
        let promptInput;
        if (target.getAttribute("data-new") === "true") {
            promptInput = form.querySelector("[name='new-col-prompt']");
        } else {
            promptInput = form.querySelector(`[name="prompt-${col}"]`);
        }
        document.getElementById("promptModalTextarea").value = promptInput.value;
        window.currentPromptInput = promptInput;
        const promptModalElement = document.getElementById("promptModal");
        const promptModalInstance = new bootstrap.Modal(promptModalElement);
        promptModalInstance.show();
    }
});

document.getElementById("promptModalSave").addEventListener("click", () => {
    const newValue = document.getElementById("promptModalTextarea").value;
    if (window.currentPromptInput) {
        window.currentPromptInput.value = newValue;
    }
    const promptModalElement = document.getElementById("promptModal");
    const promptModalInstance = bootstrap.Modal.getInstance(promptModalElement);
    promptModalInstance.hide();
});

// Expose generateGraph to the global scope for inline onclick handlers.
window.generateGraph = generateGraph;