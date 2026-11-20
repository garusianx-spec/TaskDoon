#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <poll.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>

#define BACKEND_PORT 3001
#define BUFFER_SIZE 16384

static volatile sig_atomic_t running = 1;
static pid_t child_pid = 0;

static void handle_signal(int sig) {
    if (sig == SIGCHLD) {
        int status;
        pid_t p;
        while ((p = waitpid(-1, &status, WNOHANG)) > 0) {
            if (p == child_pid) {
                running = 0;
            }
        }
    } else if (sig == SIGTERM || sig == SIGINT) {
        running = 0;
        if (child_pid > 0) {
            kill(child_pid, sig);
        }
    }
}

static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static int connect_backend(int timeout_ms) {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) return -1;

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(BACKEND_PORT);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    int elapsed = 0;
    while (elapsed < timeout_ms) {
        if (connect(s, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
            return s;
        }
        usleep(25000); /* 25ms */
        elapsed += 25;
    }
    close(s);
    return -1;
}

static void proxy_connection(int client_fd, const char *initial_buf, size_t initial_len) {
    int backend_fd = connect_backend(15000); /* wait up to 15s for Next.js backend */
    if (backend_fd < 0) {
        const char *err = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 11\r\nConnection: close\r\n\r\nBad Gateway";
        (void)write(client_fd, err, strlen(err));
        close(client_fd);
        return;
    }

    if (initial_len > 0) {
        size_t written = 0;
        while (written < initial_len) {
            ssize_t n = write(backend_fd, initial_buf + written, initial_len - written);
            if (n <= 0) {
                close(backend_fd);
                close(client_fd);
                return;
            }
            written += (size_t)n;
        }
    }

    set_nonblocking(client_fd);
    set_nonblocking(backend_fd);

    struct pollfd fds[2];
    fds[0].fd = client_fd;
    fds[1].fd = backend_fd;

    char buf[BUFFER_SIZE];

    while (running) {
        fds[0].events = POLLIN;
        fds[1].events = POLLIN;
        fds[0].revents = 0;
        fds[1].revents = 0;

        int ret = poll(fds, 2, 30000);
        if (ret <= 0) break;

        if (fds[0].revents & (POLLIN | POLLHUP | POLLERR)) {
            ssize_t n = read(client_fd, buf, sizeof(buf));
            if (n <= 0) break;
            ssize_t w = 0;
            while (w < n) {
                ssize_t sent = write(backend_fd, buf + w, (size_t)(n - w));
                if (sent <= 0) goto done;
                w += sent;
            }
        }

        if (fds[1].revents & (POLLIN | POLLHUP | POLLERR)) {
            ssize_t n = read(backend_fd, buf, sizeof(buf));
            if (n <= 0) break;
            ssize_t w = 0;
            while (w < n) {
                ssize_t sent = write(client_fd, buf + w, (size_t)(n - w));
                if (sent <= 0) goto done;
                w += sent;
            }
        }
    }

done:
    close(backend_fd);
    close(client_fd);
}

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;

    int port = 3000;
    const char *port_env = getenv("PORT");
    if (port_env) {
        int p = atoi(port_env);
        if (p > 0) port = p;
    }

    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = handle_signal;
    sigaction(SIGTERM, &sa, NULL);
    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGCHLD, &sa, NULL);
    signal(SIGPIPE, SIG_IGN);

    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(port);

    if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        return 1;
    }

    if (listen(listen_fd, 128) < 0) {
        perror("listen");
        return 1;
    }

    /* Fork child process for Node Next.js server */
    child_pid = fork();
    if (child_pid < 0) {
        perror("fork");
        return 1;
    }

    if (child_pid == 0) {
        char port_str[16];
        char *node_argv[] = {"node", "apps/web/server.js", NULL};
        snprintf(port_str, sizeof(port_str), "%d", BACKEND_PORT);
        setenv("PORT", port_str, 1);
        setenv("HOSTNAME", "127.0.0.1", 1);
        close(listen_fd);

        execvp("/usr/local/bin/node", node_argv);
        execvp("node", node_argv);
        perror("execvp");
        _exit(1);
    }

    /* Parent process: serve instant health checks and proxy traffic */
    while (running) {
        struct pollfd pfd;
        pfd.fd = listen_fd;
        pfd.events = POLLIN;
        pfd.revents = 0;

        int ret = poll(&pfd, 1, 1000);
        if (ret < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (ret == 0) continue;

        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(listen_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK) continue;
            break;
        }

        char peek_buf[1024];
        ssize_t n = read(client_fd, peek_buf, sizeof(peek_buf) - 1);
        if (n <= 0) {
            close(client_fd);
            continue;
        }
        peek_buf[n] = '\0';

        if (strncmp(peek_buf, "GET /api/health", 15) == 0 ||
            strncmp(peek_buf, "HEAD /api/health", 16) == 0) {
            const char *health_resp =
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/json\r\n"
                "Cache-Control: no-store\r\n"
                "Content-Length: 15\r\n"
                "Connection: close\r\n"
                "\r\n"
                "{\"status\":\"ok\"}";
            (void)write(client_fd, health_resp, strlen(health_resp));
            close(client_fd);
        } else {
            pid_t proxy_pid = fork();
            if (proxy_pid == 0) {
                close(listen_fd);
                proxy_connection(client_fd, peek_buf, (size_t)n);
                _exit(0);
            }
            close(client_fd);
        }
    }

    if (child_pid > 0) {
        int status;
        kill(child_pid, SIGTERM);
        waitpid(child_pid, &status, 0);
    }
    close(listen_fd);
    return 0;
}
