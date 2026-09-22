async function adminSessionToken(secret) {
  const data = new TextEncoder().encode(`bonnys-admin-session:${secret}`);

  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const validCategories = [
      "Trajes",
      "Sacos",
      "Complementos",
      "Accesorios",
      "Telas"
    ];

    // --------------------------------------------------
    // SESIÓN DE ADMINISTRACIÓN
    // --------------------------------------------------
    const getCookie = (name) => {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(
        new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
      );

      return match ? decodeURIComponent(match[1]) : null;
    };

    const hasAdminSession = async () => {
      if (!env.ADMIN_KEY) return false;

      const currentToken = getCookie("bonnys_admin");

      if (!currentToken) return false;

      const expectedToken = await adminSessionToken(env.ADMIN_KEY);

      return currentToken === expectedToken;
    };


    // --------------------------------------------------
    // API: Comprobar Worker + D1
    // --------------------------------------------------
    if (url.pathname === "/api/health") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return Response.json({
          success: true,
          worker: "bonnyscollection",
          database: "connected",
          result
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            database: "error",
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // --------------------------------------------------
    // API ADMIN: Iniciar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/login" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const password = String(body.password || "");

        if (!env.ADMIN_KEY || password !== env.ADMIN_KEY) {
          return Response.json(
            {
              success: false,
              error: "Clave incorrecta"
            },
            { status: 401 }
          );
        }

        const token = await adminSessionToken(env.ADMIN_KEY);

        return new Response(
          JSON.stringify({
            success: true
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Set-Cookie":
                `bonnys_admin=${token}; ` +
                "HttpOnly; Secure; SameSite=Strict; " +
                "Path=/; Max-Age=28800"
            }
          }
        );

      } catch {
        return Response.json(
          {
            success: false,
            error: "Solicitud inválida"
          },
          { status: 400 }
        );
      }
    }


    // --------------------------------------------------
    // API ADMIN: Comprobar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/session" &&
      request.method === "GET"
    ) {
      return Response.json(
        {
          success: true,
          authenticated: await hasAdminSession()
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }


    // --------------------------------------------------
    // API ADMIN: Cerrar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/logout" &&
      request.method === "POST"
    ) {
      return new Response(
        JSON.stringify({
          success: true
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie":
              "bonnys_admin=; HttpOnly; Secure; " +
              "SameSite=Strict; Path=/; Max-Age=0"
          }
        }
      );
    }


    // --------------------------------------------------
    // API: Obtener productos
    // --------------------------------------------------
    if (
      url.pathname === "/api/products" &&
      request.method === "GET"
    ) {
      try {
        const { results } = await env.DB
          .prepare(`
            SELECT
              p.id,
              p.slug,
              p.name,
              p.category,
              p.description,
              p.price,
              p.color,
              p.active,
              p.created_at,
              p.updated_at,
                            COALESCE(
                (
                  SELECT SUM(i.stock)
                  FROM inventory i
                  WHERE i.product_id = p.id
                ),
                0
              ) AS stock,

              COALESCE(
                (
                  SELECT json_group_array(size)
                  FROM (
                    SELECT i.size AS size
                    FROM inventory i
                    WHERE i.product_id = p.id
                    ORDER BY i.size
                  )
                ),
                '[]'
              ) AS sizes,
              COALESCE(
                (
                  SELECT json_group_array(image_url)
                  FROM (
                    SELECT image_url
                    FROM product_images
                    WHERE product_id = p.id
                    ORDER BY sort_order, id
                  )
                ),
                '[]'
              ) AS images
            FROM products p
            WHERE p.active = 1
            ORDER BY p.id ASC
          `)
          .all();

        const products = results.map(product => ({
  ...product,
  stock: Number(product.stock || 0),
  sizes: JSON.parse(product.sizes || "[]"),
  images: JSON.parse(product.images || "[]")
}));

        return Response.json({
          success: true,
          products
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // --------------------------------------------------
    // API: Inventario de un producto
    // --------------------------------------------------
    if (
      url.pathname === "/api/inventory" &&
      request.method === "GET"
    ) {
      const productId = Number(
        url.searchParams.get("product_id")
      );

      if (
        !Number.isInteger(productId) ||
        productId <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "product_id inválido"
          },
          { status: 400 }
        );
      }

      try {
        const { results } = await env.DB
          .prepare(`
            SELECT
              id,
              product_id,
              size,
              stock
            FROM inventory
            WHERE product_id = ?
            ORDER BY size
          `)
          .bind(productId)
          .all();

        return Response.json({
          success: true,
          inventory: results
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // API ADMIN: Guardar inventario por talla
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/admin/inventory/") &&
      request.method === "PUT"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      const productId = Number(
        url.pathname.split("/").pop()
      );

      if (
        !Number.isInteger(productId) ||
        productId <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "ID de producto inválido"
          },
          { status: 400 }
        );
      }

      try {
        const body = await request.json();

        if (!Array.isArray(body.inventory)) {
          return Response.json(
            {
              success: false,
              error: "Inventario inválido"
            },
            { status: 400 }
          );
        }

        // Comprobar que el producto existe y está activo
        const product = await env.DB
          .prepare(`
            SELECT id
            FROM products
            WHERE id = ?
              AND active = 1
          `)
          .bind(productId)
          .first();

        if (!product) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        // Validar y normalizar tallas
        const inventory = [];
        const usedSizes = new Set();

        for (const item of body.inventory) {
          const size = String(item.size || "").trim();
          const stock = Number(item.stock);

          if (!size) {
            return Response.json(
              {
                success: false,
                error: "Todas las tallas deben tener un nombre"
              },
              { status: 400 }
            );
          }

          if (
            !Number.isInteger(stock) ||
            stock < 0
          ) {
            return Response.json(
              {
                success: false,
                error: `Stock inválido para la talla ${size}`
              },
              { status: 400 }
            );
          }

          const sizeKey = size.toLowerCase();

          if (usedSizes.has(sizeKey)) {
            return Response.json(
              {
                success: false,
                error: `La talla ${size} está repetida`
              },
              { status: 400 }
            );
          }

          usedSizes.add(sizeKey);

          inventory.push({
            size,
            stock
          });
        }

        // Reemplazar el inventario actual del producto
        const statements = [
          env.DB
            .prepare(`
              DELETE FROM inventory
              WHERE product_id = ?
            `)
            .bind(productId)
        ];

        for (const item of inventory) {
          statements.push(
            env.DB
              .prepare(`
                INSERT INTO inventory
                (
                  product_id,
                  size,
                  stock
                )
                VALUES (?, ?, ?)
              `)
              .bind(
                productId,
                item.size,
                item.stock
              )
          );
        }

        await env.DB.batch(statements);

        const totalStock = inventory.reduce(
          (total, item) => total + item.stock,
          0
        );

        return Response.json({
          success: true,
          product_id: productId,
          inventory,
          total_stock: totalStock
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
        // --------------------------------------------------
    // API PUBLICA: Mostrar imagen almacenada en R2
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/images/") &&
      request.method === "GET"
    ) {
      try {
        const key = decodeURIComponent(
          url.pathname.replace("/api/images/", "")
        );

        if (!key) {
          return new Response("Imagen no encontrada", {
            status: 404
          });
        }

        const object = await env.IMAGES.get(key);

        if (!object) {
          return new Response("Imagen no encontrada", {
            status: 404
          });
        }

        const headers = new Headers();

        object.writeHttpMetadata(headers);

        headers.set(
          "etag",
          object.httpEtag
        );

        headers.set(
          "Cache-Control",
          "public, max-age=31536000, immutable"
        );

        return new Response(
          object.body,
          {
            headers
          }
        );

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
        // --------------------------------------------------
    // API ADMIN: Subir imagen a R2
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/images" &&
      request.method === "POST"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      try {
        const formData = await request.formData();
        const file = formData.get("image");

        if (!file || typeof file === "string") {
          return Response.json(
            {
              success: false,
              error: "No se recibió una imagen"
            },
            { status: 400 }
          );
        }

        if (!file.type || !file.type.startsWith("image/")) {
          return Response.json(
            {
              success: false,
              error: "El archivo debe ser una imagen"
            },
            { status: 400 }
          );
        }

        const extension =
          file.name && file.name.includes(".")
            ? file.name.split(".").pop().toLowerCase()
            : "jpg";

        const key =
          `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        await env.IMAGES.put(
          key,
          await file.arrayBuffer(),
          {
            httpMetadata: {
              contentType: file.type
            }
          }
        );

        return Response.json({
          success: true,
          key,
          url: `/api/images/${key}`
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
    // --------------------------------------------------
    // API ADMIN: Asociar imagen a producto
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/product-images" &&
      request.method === "POST"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      try {
        const body = await request.json();

        const productId = Number(body.product_id);
        const imageUrl = String(body.image_url || "").trim();
        const sortOrder = Number(body.sort_order || 0);

        if (!Number.isInteger(productId) || productId <= 0) {
          return Response.json(
            {
              success: false,
              error: "ID de producto inválido"
            },
            { status: 400 }
          );
        }

        if (!imageUrl.startsWith("/api/images/")) {
          return Response.json(
            {
              success: false,
              error: "URL de imagen inválida"
            },
            { status: 400 }
          );
        }

        const product = await env.DB
          .prepare(
            `SELECT id FROM products WHERE id = ? AND active = 1`
          )
          .bind(productId)
          .first();

        if (!product) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        const result = await env.DB
          .prepare(`
            INSERT INTO product_images
            (
              product_id,
              image_url,
              sort_order
            )
            VALUES (?, ?, ?)
          `)
          .bind(
            productId,
            imageUrl,
            sortOrder
          )
          .run();

        return Response.json({
          success: true,
          id: result.meta.last_row_id,
          product_id: productId,
          image_url: imageUrl
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
        // --------------------------------------------------
    // API ADMIN: Eliminar imagen de producto
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/product-images" &&
      request.method === "DELETE"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      try {
        const body = await request.json();

        const productId = Number(body.product_id);
        const imageUrl = String(body.image_url || "").trim();

        if (!Number.isInteger(productId) || productId <= 0) {
          return Response.json(
            {
              success: false,
              error: "ID de producto inválido"
            },
            { status: 400 }
          );
        }

        if (!imageUrl.startsWith("/api/images/")) {
          return Response.json(
            {
              success: false,
              error: "URL de imagen inválida"
            },
            { status: 400 }
          );
        }

        const image = await env.DB
          .prepare(`
            SELECT id, image_url
            FROM product_images
            WHERE product_id = ?
              AND image_url = ?
          `)
          .bind(
            productId,
            imageUrl
          )
          .first();

        if (!image) {
          return Response.json(
            {
              success: false,
              error: "Imagen no encontrada"
            },
            { status: 404 }
          );
        }

        await env.DB
          .prepare(`
            DELETE FROM product_images
            WHERE id = ?
          `)
          .bind(image.id)
          .run();

        const key = decodeURIComponent(
          image.image_url.replace("/api/images/", "")
        );

        if (key) {
          await env.IMAGES.delete(key);
        }

        return Response.json({
          success: true,
          product_id: productId,
          image_url: imageUrl
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
    // --------------------------------------------------
    // API ADMIN: Crear producto
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/products" &&
      request.method === "POST"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      try {
        const body = await request.json();

        const name = String(body.name || "").trim();
        const category =
          String(body.category || "").trim();
        const description =
          String(body.description || "").trim();
        const color =
          String(body.color || "").trim();

        const price = Number(body.price || 0);

        if (!name) {
          return Response.json(
            {
              success: false,
              error: "El nombre es obligatorio"
            },
            { status: 400 }
          );
        }

        if (!validCategories.includes(category)) {
          return Response.json(
            {
              success: false,
              error: "Categoría inválida"
            },
            { status: 400 }
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          return Response.json(
            {
              success: false,
              error: "Precio inválido"
            },
            { status: 400 }
          );
        }

        const baseSlug =
          String(body.slug || name)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        const slug =
          `${baseSlug || "producto"}-${Date.now()}`;

        const result = await env.DB
          .prepare(`
            INSERT INTO products
            (
              slug,
              name,
              category,
              description,
              price,
              color,
              active
            )
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `)
          .bind(
            slug,
            name,
            category,
            description,
            price,
            color
          )
          .run();

        return Response.json({
          success: true,
          id: result.meta.last_row_id,
          slug
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // --------------------------------------------------
    // API ADMIN: Editar producto
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/admin/products/") &&
      request.method === "PUT"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      const id = Number(
        url.pathname.split("/").pop()
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "ID inválido"
          },
          { status: 400 }
        );
      }

      try {
        const body = await request.json();

        const name =
          String(body.name || "").trim();

        const category =
          String(body.category || "").trim();

        const description =
          String(body.description || "").trim();

        const color =
          String(body.color || "").trim();

        const price =
          Number(body.price || 0);

        if (
          !name ||
          !validCategories.includes(category)
        ) {
          return Response.json(
            {
              success: false,
              error: "Datos inválidos"
            },
            { status: 400 }
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          return Response.json(
            {
              success: false,
              error: "Precio inválido"
            },
            { status: 400 }
          );
        }

        const result = await env.DB
          .prepare(`
            UPDATE products
            SET
              name = ?,
              category = ?,
              description = ?,
              price = ?,
              color = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(
            name,
            category,
            description,
            price,
            color,
            id
          )
          .run();

        if (!result.meta.changes) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        return Response.json({
          success: true,
          id
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // --------------------------------------------------
    // API ADMIN: Desactivar producto
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/admin/products/") &&
      request.method === "DELETE"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      const id = Number(
        url.pathname.split("/").pop()
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "ID inválido"
          },
          { status: 400 }
        );
      }

      try {
        const result = await env.DB
          .prepare(`
            UPDATE products
            SET
              active = 0,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(id)
          .run();

        if (!result.meta.changes) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        return Response.json({
          success: true,
          id
        });

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // --------------------------------------------------
    // El resto conserva el sitio estático
    // --------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};
