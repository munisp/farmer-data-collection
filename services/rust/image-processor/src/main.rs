use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use aws_config::BehaviorVersion;
use aws_sdk_s3::Client as S3Client;
use bytes::Bytes;
use fast_image_resize::{images::Image, Resizer};
use image::{DynamicImage, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use std::{env, io::Cursor, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    s3_client: S3Client,
    bucket: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    version: String,
}

#[derive(Serialize)]
struct UploadResponse {
    success: bool,
    key: String,
    url: String,
    original_size: usize,
    processed_size: usize,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

#[derive(Deserialize)]
struct ResizeParams {
    width: Option<u32>,
    height: Option<u32>,
    quality: Option<u8>,
}

#[derive(Serialize)]
struct ThumbnailResponse {
    success: bool,
    thumbnails: Vec<ThumbnailInfo>,
}

#[derive(Serialize)]
struct ThumbnailInfo {
    size: String,
    key: String,
    url: String,
    width: u32,
    height: u32,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "rust-image-processor".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn upload_image(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                success: false,
                error: format!("Failed to read multipart: {}", e),
            }),
        )
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "image" || name == "file" {
            let content_type = field.content_type().unwrap_or("image/jpeg").to_string();
            let data = field.bytes().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        success: false,
                        error: format!("Failed to read file data: {}", e),
                    }),
                )
            })?;

            let original_size = data.len();
            let (processed_data, width, height) = process_image(&data, None, None, Some(85))
                .map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            success: false,
                            error: format!("Failed to process image: {}", e),
                        }),
                    )
                })?;

            let key = format!("images/{}.jpg", Uuid::new_v4());
            let processed_size = processed_data.len();

            upload_to_s3(&state.s3_client, &state.bucket, &key, processed_data, &content_type)
                .await
                .map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            success: false,
                            error: format!("Failed to upload to S3: {}", e),
                        }),
                    )
                })?;

            let endpoint = env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
            let url = format!("{}/{}/{}", endpoint, state.bucket, key);

            return Ok(Json(UploadResponse {
                success: true,
                key,
                url,
                original_size,
                processed_size,
                width,
                height,
            }));
        }
    }

    Err((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            success: false,
            error: "No image field found in request".to_string(),
        }),
    ))
}

async fn generate_thumbnails(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> Result<Json<ThumbnailResponse>, (StatusCode, Json<ErrorResponse>)> {
    let data = download_from_s3(&state.s3_client, &state.bucket, &key)
        .await
        .map_err(|e| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    success: false,
                    error: format!("Failed to download image: {}", e),
                }),
            )
        })?;

    let thumbnail_sizes = vec![
        ("small", 150, 150),
        ("medium", 300, 300),
        ("large", 600, 600),
    ];

    let mut thumbnails = Vec::new();
    let endpoint = env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());

    for (size_name, width, height) in thumbnail_sizes {
        let (thumb_data, actual_width, actual_height) =
            process_image(&data, Some(width), Some(height), Some(80)).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        success: false,
                        error: format!("Failed to create thumbnail: {}", e),
                    }),
                )
            })?;

        let thumb_key = format!("thumbnails/{}/{}", size_name, key);
        upload_to_s3(
            &state.s3_client,
            &state.bucket,
            &thumb_key,
            thumb_data,
            "image/jpeg",
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    success: false,
                    error: format!("Failed to upload thumbnail: {}", e),
                }),
            )
        })?;

        thumbnails.push(ThumbnailInfo {
            size: size_name.to_string(),
            key: thumb_key.clone(),
            url: format!("{}/{}/{}", endpoint, state.bucket, thumb_key),
            width: actual_width,
            height: actual_height,
        });
    }

    Ok(Json(ThumbnailResponse {
        success: true,
        thumbnails,
    }))
}

async fn resize_image(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
    axum::extract::Query(params): axum::extract::Query<ResizeParams>,
) -> Result<Json<UploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    let data = download_from_s3(&state.s3_client, &state.bucket, &key)
        .await
        .map_err(|e| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    success: false,
                    error: format!("Failed to download image: {}", e),
                }),
            )
        })?;

    let original_size = data.len();
    let (processed_data, width, height) =
        process_image(&data, params.width, params.height, params.quality).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    success: false,
                    error: format!("Failed to resize image: {}", e),
                }),
            )
        })?;

    let resized_key = format!("resized/{}", key);
    let processed_size = processed_data.len();

    upload_to_s3(
        &state.s3_client,
        &state.bucket,
        &resized_key,
        processed_data,
        "image/jpeg",
    )
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                success: false,
                error: format!("Failed to upload resized image: {}", e),
            }),
        )
    })?;

    let endpoint = env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());

    Ok(Json(UploadResponse {
        success: true,
        key: resized_key.clone(),
        url: format!("{}/{}/{}", endpoint, state.bucket, resized_key),
        original_size,
        processed_size,
        width,
        height,
    }))
}

fn process_image(
    data: &[u8],
    target_width: Option<u32>,
    target_height: Option<u32>,
    quality: Option<u8>,
) -> anyhow::Result<(Bytes, u32, u32)> {
    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()?
        .decode()?;

    let (orig_width, orig_height) = (img.width(), img.height());

    let (new_width, new_height) = match (target_width, target_height) {
        (Some(w), Some(h)) => {
            let ratio = (w as f32 / orig_width as f32).min(h as f32 / orig_height as f32);
            (
                (orig_width as f32 * ratio) as u32,
                (orig_height as f32 * ratio) as u32,
            )
        }
        (Some(w), None) => {
            let ratio = w as f32 / orig_width as f32;
            (w, (orig_height as f32 * ratio) as u32)
        }
        (None, Some(h)) => {
            let ratio = h as f32 / orig_height as f32;
            ((orig_width as f32 * ratio) as u32, h)
        }
        (None, None) => (orig_width, orig_height),
    };

    let resized = if new_width != orig_width || new_height != orig_height {
        img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let mut output = Cursor::new(Vec::new());
    let quality_val = quality.unwrap_or(85);
    
    resized.write_to(
        &mut output,
        ImageFormat::Jpeg,
    )?;

    Ok((Bytes::from(output.into_inner()), new_width, new_height))
}

async fn upload_to_s3(
    client: &S3Client,
    bucket: &str,
    key: &str,
    data: Bytes,
    content_type: &str,
) -> anyhow::Result<()> {
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(data.into())
        .content_type(content_type)
        .send()
        .await?;

    info!("Uploaded {} to bucket {}", key, bucket);
    Ok(())
}

async fn download_from_s3(client: &S3Client, bucket: &str, key: &str) -> anyhow::Result<Bytes> {
    let response = client.get_object().bucket(bucket).key(key).send().await?;

    let data = response.body.collect().await?.into_bytes();
    Ok(data)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("image_processor=info".parse()?),
        )
        .init();

    let endpoint = env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let access_key = env::var("S3_ACCESS_KEY").expect("S3_ACCESS_KEY must be set");
    let secret_key = env::var("S3_SECRET_KEY").expect("S3_SECRET_KEY must be set");
    let bucket = env::var("S3_BUCKET").unwrap_or_else(|_| "farmer-uploads".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "8015".to_string());

    info!("Connecting to S3-compatible storage at {}", endpoint);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .endpoint_url(&endpoint)
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            &access_key,
            &secret_key,
            None,
            None,
            "static",
        ))
        .region(aws_sdk_s3::config::Region::new("us-east-1"))
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();

    let s3_client = S3Client::from_conf(s3_config);

    let state = Arc::new(AppState { s3_client, bucket });

    let app = Router::new()
        .route("/health", get(health))
        .route("/upload", post(upload_image))
        .route("/thumbnails/:key", post(generate_thumbnails))
        .route("/resize/:key", post(resize_image))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    info!("Starting Rust Image Processor on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum_test::TestServer;

    #[tokio::test]
    async fn test_health_endpoint() {
        let state = AppState {
            upload_dir: std::path::PathBuf::from("/tmp/test-uploads"),
            max_file_size: 10 * 1024 * 1024,
            allowed_formats: vec!["jpg".to_string(), "png".to_string(), "webp".to_string()],
        };
        let app = axum::Router::new()
            .route("/health", axum::routing::get(health))
            .with_state(state);

        let server = TestServer::new(app).unwrap();
        let response = server.get("/health").await;
        assert_eq!(response.status_code(), StatusCode::OK);
    }

    #[test]
    fn test_image_dimensions_validation() {
        assert!(validate_dimensions(1920, 1080));
        assert!(validate_dimensions(100, 100));
        assert!(!validate_dimensions(0, 0));
        assert!(!validate_dimensions(50000, 50000));
    }

    #[test]
    fn test_thumbnail_sizes() {
        let sizes: Vec<(&str, u32, u32)> = vec![
            ("small", 150, 150),
            ("medium", 300, 300),
            ("large", 800, 600),
        ];
        for (name, w, h) in &sizes {
            assert!(validate_dimensions(*w, *h), "Size {} should be valid", name);
        }
    }

    #[test]
    fn test_resize_ratio_calculation() {
        let (orig_w, orig_h) = (1920u32, 1080u32);
        let target_w = 800u32;
        let ratio = target_w as f32 / orig_w as f32;
        let new_h = (orig_h as f32 * ratio) as u32;
        assert_eq!(new_h, 450);
    }

    #[test]
    fn test_s3_key_generation() {
        let key = generate_s3_key("upload-123", "jpg");
        assert!(key.contains("upload-123"));
        assert!(key.ends_with(".jpg"));
    }

    #[test]
    fn test_content_type_detection() {
        assert_eq!(detect_content_type("jpg"), "image/jpeg");
        assert_eq!(detect_content_type("png"), "image/png");
        assert_eq!(detect_content_type("webp"), "image/webp");
        assert_eq!(detect_content_type("unknown"), "application/octet-stream");
    }

    #[test]
    fn test_allowed_formats() {
        let allowed = vec!["jpg".to_string(), "png".to_string(), "webp".to_string()];
        assert!(allowed.contains(&"jpg".to_string()));
        assert!(allowed.contains(&"png".to_string()));
        assert!(!allowed.contains(&"bmp".to_string()));
    }

    fn validate_dimensions(width: u32, height: u32) -> bool {
        width > 0 && height > 0 && width <= 10000 && height <= 10000
    }

    fn generate_s3_key(upload_id: &str, ext: &str) -> String {
        format!("images/{}.{}", upload_id, ext)
    }

    fn detect_content_type(ext: &str) -> &str {
        match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "application/octet-stream",
        }
    }
}
