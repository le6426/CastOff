import os
from contextlib import contextmanager
from psycopg_pool import ConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL")

pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=2,
    max_size=10,
    open=True  # Opens min_size connections immediately
)

@contextmanager
def get_connection():
    """
    Borrows a connection from the pool and returns it automatically 
    when the 'with' block completes.
    """
    with pool.connection() as conn:
        yield conn 